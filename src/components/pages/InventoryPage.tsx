'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, getProductImageUrl, PRODUCT_IMAGES_BUCKET } from '@/lib/supabase'
import { Product, UnitType } from '@/types/database'
import imageCompression from 'browser-image-compression'
import toast from 'react-hot-toast'

interface ProductCreationItem {
  item: Product
  qty: number
}

export default function InventoryPage() {
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Product | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Product Creation state
  const [productCreation, setProductCreation] = useState<ProductCreationItem[]>([])
  const [selectedItem, setSelectedItem] = useState<Product | null>(null)
  const [itemQuantity, setItemQuantity] = useState<string>('1')
  const [showProductSaveModal, setShowProductSaveModal] = useState(false)
  const [productName, setProductName] = useState('')
  const [productSellingPrice, setProductSellingPrice] = useState('')
  const [productImageFile, setProductImageFile] = useState<File | null>(null)
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null)
  const productFileInputRef = useRef<HTMLInputElement>(null)

  // Form state for inventory items
  const [formData, setFormData] = useState({
    name: '',
    unit_type: 'quantity' as UnitType,
    qty: '',
    totalCost: '',
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name')

      if (error) throw error
      setItems(data || [])
    } catch (error) {
      console.error('Error fetching items:', error)
      toast.error('Failed to load items')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const resetForm = () => {
    setFormData({
      name: '',
      unit_type: 'quantity',
      qty: '',
      totalCost: '',
    })
    setImageFile(null)
    setImagePreview(null)
  }

  const openAddModal = () => {
    resetForm()
    setEditingItem(null)
    setShowAddModal(true)
  }

  const openEditModal = (item: Product) => {
    const stockInDisplayUnit = getDisplayQuantity(item)
    const totalCost = item.cost * stockInDisplayUnit

    setFormData({
      name: item.name,
      unit_type: item.unit_type,
      qty: stockInDisplayUnit.toString(),
      totalCost: totalCost.toFixed(2),
    })
    setImagePreview(item.image_url ? getProductImageUrl(item.image_url) : null)
    setImageFile(null)
    setEditingItem(item)
    setShowAddModal(true)
  }

  const closeModal = () => {
    setShowAddModal(false)
    setEditingItem(null)
    resetForm()
  }

  // Get display quantity based on unit type
  const getDisplayQuantity = (item: Product): number => {
    if (item.unit_type === 'weight') return item.qty * 1000 // kg to grams
    if (item.unit_type === 'volume') return item.qty * 1000 // L to ml
    return item.qty // pieces
  }

  // Get storage quantity from display
  const getStorageQuantity = (displayQty: number, unitType: UnitType): number => {
    if (unitType === 'weight') return displayQty / 1000 // grams to kg
    if (unitType === 'volume') return displayQty / 1000 // ml to L
    return displayQty // pieces
  }

  // Get unit label
  const getUnitLabel = (unitType: UnitType): string => {
    if (unitType === 'weight') return 'g'
    if (unitType === 'volume') return 'ml'
    return 'pcs'
  }

  // Calculate per-unit cost
  const calculatePerUnitCost = (): number => {
    const qty = parseFloat(formData.qty) || 0
    const totalCost = parseFloat(formData.totalCost) || 0
    if (qty <= 0) return 0
    return totalCost / qty
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const options = {
        maxSizeMB: 0.15,
        maxWidthOrHeight: 100,
        useWebWorker: true,
      }

      const compressedFile = await imageCompression(file, options)
      setImageFile(compressedFile)

      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(compressedFile)
    } catch (error) {
      console.error('Error compressing image:', error)
      toast.error('Failed to process image')
    }
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `inventory-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

      const { error, data } = await (supabase as any).storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (error) {
        console.error('Upload error:', error)
        toast.error(`Upload failed: ${error.message}`)
        return null
      }
      
      return fileName
    } catch (error: any) {
      console.error('Error uploading image:', error)
      toast.error(`Upload error: ${error?.message || 'Unknown error'}`)
      return null
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Please enter an item name')
      return
    }

    const qty = parseFloat(formData.qty) || 0
    if (qty <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    setIsSubmitting(true)

    try {
      let imagePath = editingItem?.image_url || null

      if (imageFile) {
        const uploadedPath = await uploadImage(imageFile)
        if (uploadedPath) {
          if (editingItem?.image_url) {
            await (supabase as any).storage
              .from(PRODUCT_IMAGES_BUCKET)
              .remove([editingItem.image_url])
          }
          imagePath = uploadedPath
        }
      }

      const perUnitCost = calculatePerUnitCost()
      const storageQty = getStorageQuantity(qty, formData.unit_type)

      const itemData: Record<string, any> = {
        name: formData.name,
        unit_type: formData.unit_type,
        qty: storageQty,
        cost: perUnitCost,
        selling_price: 0,
        image_url: imagePath,
      }

      if (editingItem) {
        if (editingItem.image_url && imageFile) {
          await (supabase as any).storage
            .from(PRODUCT_IMAGES_BUCKET)
            .remove([editingItem.image_url])
        }

        const { error } = await (supabase as any)
          .from('products')
          .update(itemData)
          .eq('id', editingItem.id)

        if (error) throw error
        toast.success('Item updated!')
      } else {
        const { error } = await (supabase as any)
          .from('products')
          .insert(itemData)

        if (error) throw error
        toast.success('Item added!')
      }

      closeModal()
      fetchItems()
    } catch (error) {
      console.error('Error saving item:', error)
      toast.error('Failed to save item')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingItem, setDeletingItem] = useState<Product | null>(null)

  const openDeleteConfirm = (item: Product) => {
    setDeletingItem(item)
    setShowDeleteConfirm(true)
  }

  const handleDelete = async () => {
    if (!deletingItem) return

    try {
      if (deletingItem.image_url) {
        await (supabase as any).storage
          .from(PRODUCT_IMAGES_BUCKET)
          .remove([deletingItem.image_url])
      }

      const { error } = await (supabase as any)
        .from('products')
        .delete()
        .eq('id', deletingItem.id)

      if (error) throw error
      toast.success('Item deleted')
      setShowDeleteConfirm(false)
      setDeletingItem(null)
      closeModal()
      fetchItems()
    } catch (error) {
      console.error('Error deleting item:', error)
      toast.error('Failed to delete item')
    }
  }

  // Product Creation Functions
  const handleItemClick = (item: Product) => {
    setSelectedItem(item)
    setItemQuantity('1')
  }

  const handleAddToProductCreation = () => {
    if (!selectedItem) return

    const qty = parseFloat(itemQuantity) || 0
    if (qty <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    const existingIndex = productCreation.findIndex((pc) => pc.item.id === selectedItem.id)
    if (existingIndex >= 0) {
      const updated = [...productCreation]
      updated[existingIndex].qty += qty
      setProductCreation(updated)
    } else {
      setProductCreation([...productCreation, { item: selectedItem, qty }])
    }

    toast.success('Added to product')
    setSelectedItem(null)
    setItemQuantity('1')
  }

  const handleRemoveFromProductCreation = (itemId: string) => {
    setProductCreation(productCreation.filter((pc) => pc.item.id !== itemId))
  }

  const handleClearProductCreation = () => {
    setProductCreation([])
  }

  const handleProductImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const options = {
        maxSizeMB: 0.15,
        maxWidthOrHeight: 100,
        useWebWorker: true,
      }

      const compressedFile = await imageCompression(file, options)
      setProductImageFile(compressedFile)

      const reader = new FileReader()
      reader.onloadend = () => {
        setProductImagePreview(reader.result as string)
      }
      reader.readAsDataURL(compressedFile)
    } catch (error) {
      console.error('Error compressing image:', error)
      toast.error('Failed to process image')
    }
  }

  // Calculate ingredient cost
  const calculateIngredientCost = (): number => {
    return productCreation.reduce((total, pc) => {
      return total + pc.item.cost * pc.qty
    }, 0)
  }

  const openProductSaveModal = () => {
    if (productCreation.length === 0) {
      toast.error('Add at least one ingredient')
      return
    }
    setProductName('')
    setProductSellingPrice('')
    setProductImageFile(null)
    setProductImagePreview(null)
    setShowProductSaveModal(true)
  }

  const closeProductSaveModal = () => {
    setShowProductSaveModal(false)
  }

  const handleSaveProduct = async () => {
    if (!productName.trim()) {
      toast.error('Please enter a product name')
      return
    }

    const sellingPrice = parseFloat(productSellingPrice) || 0
    if (sellingPrice <= 0) {
      toast.error('Please enter a valid selling price')
      return
    }

    setIsSubmitting(true)

    try {
      let imagePath = null

      if (productImageFile) {
        const fileExt = productImageFile.name.split('.').pop()
        const fileName = `product-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

        const { error } = await (supabase as any).storage
          .from(PRODUCT_IMAGES_BUCKET)
          .upload(fileName, productImageFile, {
            cacheControl: '3600',
            upsert: false,
          })

        if (!error) {
          imagePath = fileName
        }
      }

      // Create the finished product
      const { data: productData, error: productError } = await (supabase as any)
        .from('finished_products')
        .insert({
          name: productName.trim(),
          selling_price: sellingPrice,
          image_url: imagePath,
        })
        .select()
        .single()

      if (productError) throw productError

      // Create product ingredients
      const ingredientRecords = productCreation.map((pc) => ({
        product_id: productData.id,
        item_id: pc.item.id,
        qty: pc.qty,
      }))

      const { error: ingError } = await (supabase as any)
        .from('product_ingredients')
        .insert(ingredientRecords)

      if (ingError) throw ingError

      toast.success('Product created!')
      setProductCreation([])
      closeProductSaveModal()
    } catch (error) {
      console.error('Error saving product:', error)
      toast.error('Failed to create product')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Format stock display
  const formatStock = (item: Product) => {
    const displayQty = getDisplayQuantity(item)
    return `${displayQty.toLocaleString()} ${getUnitLabel(item.unit_type)}`
  }

  // Get total value
  const getTotalValue = (item: Product) => {
    const stockInDisplayUnit = getDisplayQuantity(item)
    return item.cost * stockInDisplayUnit
  }

  const perUnitCost = calculatePerUnitCost()
  const ingredientCost = calculateIngredientCost()
  const grossProfit = (parseFloat(productSellingPrice) || 0) - ingredientCost

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto flex flex-col h-full">
      {/* Top Section - Product Creation */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">
            Product Creation{' '}
            {productCreation.length > 0 && (
              <span className="text-surface-400">({productCreation.length} ingredients)</span>
            )}
          </h2>
          <div className="flex gap-2">
            {productCreation.length > 0 && (
              <>
                <button
                  onClick={handleClearProductCreation}
                  className="text-sm text-red-400 hover:text-red-300 px-3 py-1"
                >
                  Clear
                </button>
                <button
                  onClick={openProductSaveModal}
                  className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  Save Product
                </button>
              </>
            )}
          </div>
        </div>

        {/* Product Creation Items */}
        <div className="min-h-[60px] max-h-32 overflow-y-auto mb-4 p-2 bg-surface-800/50 rounded-lg">
          {productCreation.length === 0 ? (
            <p className="text-surface-500 text-sm text-center py-4">
              Click on inventory items below to add ingredients
            </p>
          ) : (
            <div className="space-y-1">
              {productCreation.map((pc) => (
                <div
                  key={pc.item.id}
                  className="flex items-center justify-between p-2 hover:bg-surface-700/50 rounded transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-surface-700 rounded overflow-hidden flex-shrink-0">
                      {pc.item.image_url ? (
                        <img
                          src={getProductImageUrl(pc.item.image_url) || ''}
                          alt={pc.item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg
                            className="w-4 h-4 text-surface-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                    <span className="text-white text-sm">{pc.item.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-surface-400 text-sm">
                      {pc.qty} {getUnitLabel(pc.item.unit_type)}
                    </span>
                    <span className="text-primary-500 font-mono text-sm">
                      ₱{(pc.item.cost * pc.qty).toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleRemoveFromProductCreation(pc.item.id)}
                      className="text-red-400 hover:text-red-300 p-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cost Summary */}
        {productCreation.length > 0 && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-yellow-400 text-sm font-medium">Ingredient Cost</p>
                <p className="text-yellow-400 font-mono font-bold text-lg">₱{ingredientCost.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-surface-500 text-xs">Suggested Min Price (30% margin)</p>
                <p className="text-primary-500 font-mono font-bold">₱{(ingredientCost * 1.3).toFixed(2)}</p>
              </div>
            </div>
            <p className="text-yellow-400/60 text-xs mt-2">⚠️ This is a Pre-OPEX calculation</p>
          </div>
        )}
      </div>

      {/* Bottom Section - Inventory Items Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white">Inventory Items</h3>
        <button
          onClick={openAddModal}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2 text-sm"
        >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Item
        </button>
      </div>

      {items.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-surface-400">No inventory items. Add items to start creating products.</p>
        </div>
      ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="card p-3 text-left hover:border-primary-500/50 transition-all group relative"
              >
                {/* Edit button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openEditModal(item)
                  }}
                  className="absolute top-2 right-2 p-1 bg-surface-800/80 rounded opacity-0 group-hover:opacity-100 transition-opacity text-surface-400 hover:text-white"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>

                <div className="aspect-square bg-surface-800 rounded-lg mb-2 overflow-hidden">
                {item.image_url ? (
                  <img
                    src={getProductImageUrl(item.image_url) || ''}
                    alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-surface-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                        />
                    </svg>
                    </div>
                  )}
                </div>
                <h4 className="font-medium text-white text-xs truncate">{item.name}</h4>
                <p className="text-surface-400 text-xs">{formatStock(item)}</p>
                <p className="text-primary-500 font-mono text-xs">
                  ₱{item.cost.toFixed(4)}/{getUnitLabel(item.unit_type)}
                </p>
              </button>
            ))}
                  </div>
                )}
              </div>

      {/* Item Selection Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-sm w-full">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 bg-surface-800 rounded-lg overflow-hidden flex-shrink-0">
                  {selectedItem.image_url ? (
                    <img
                      src={getProductImageUrl(selectedItem.image_url) || ''}
                      alt={selectedItem.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-surface-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                        />
                      </svg>
                </div>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedItem.name}</h3>
                  <p className="text-surface-400 text-sm">
                    {formatStock(selectedItem)} available
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-surface-400 hover:text-white p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              </div>

            {/* Quantity Controls */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-surface-300 mb-2">
                Quantity ({getUnitLabel(selectedItem.unit_type)})
              </label>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() =>
                    setItemQuantity(Math.max(1, (parseFloat(itemQuantity) || 0) - 1).toString())
                  }
                  className="w-14 h-14 flex-shrink-0 rounded-lg bg-surface-700 hover:bg-surface-600 text-white flex items-center justify-center text-2xl font-bold border border-surface-600 transition-colors"
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  value={itemQuantity}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setItemQuantity(val)
                    }
                  }}
                  className="w-24 px-4 py-3 bg-surface-800 border border-surface-700 rounded-lg text-white text-center font-mono text-xl"
                />
                <button
                  onClick={() =>
                    setItemQuantity(((parseFloat(itemQuantity) || 0) + 1).toString())
                  }
                  className="w-14 h-14 flex-shrink-0 rounded-lg bg-surface-700 hover:bg-surface-600 text-white flex items-center justify-center text-2xl font-bold border border-surface-600 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Cost Preview */}
            <div className="flex items-center justify-between mb-4 p-3 bg-surface-800/50 rounded-lg">
              <span className="text-surface-400">Cost</span>
              <span className="text-xl font-bold text-primary-500">
                ₱{((parseFloat(itemQuantity) || 0) * selectedItem.cost).toFixed(2)}
              </span>
            </div>

            {/* Action Button */}
            <button
              onClick={handleAddToProductCreation}
              disabled={(parseFloat(itemQuantity) || 0) <= 0}
              className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
            >
              Add to Product
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Inventory Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingItem ? 'Edit Item' : 'Add New Item'}
              </h2>
              <button onClick={closeModal} className="text-surface-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Item Image (optional)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-video bg-surface-800 border-2 border-dashed border-surface-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-primary-500/50 transition-colors overflow-hidden"
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center p-4">
                      <svg
                        className="w-8 h-8 text-surface-500 mx-auto mb-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <p className="text-surface-500 text-sm">Click to upload</p>
                      <p className="text-surface-600 text-xs">Max 100x100px, 150KB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">Item Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white"
                  placeholder="e.g., Rice, Sugar, Milk"
                  required
                />
              </div>

              {/* Unit Type */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">Unit Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, unit_type: 'quantity' }))}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                      formData.unit_type === 'quantity'
                        ? 'bg-primary-500 text-white'
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    Pieces (pcs)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, unit_type: 'weight' }))}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                      formData.unit_type === 'weight'
                        ? 'bg-primary-500 text-white'
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    Grams (g)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, unit_type: 'volume' }))}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                      formData.unit_type === 'volume'
                        ? 'bg-primary-500 text-white'
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    Milliliters (ml)
                  </button>
                </div>
              </div>

              {/* Stock Amount */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Stock Amount ({getUnitLabel(formData.unit_type)})
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.qty}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                      setFormData((prev) => ({ ...prev, qty: val }))
                    }
                  }}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white font-mono"
                  placeholder={
                    formData.unit_type === 'weight'
                      ? 'e.g., 100000 (for 100kg)'
                      : formData.unit_type === 'volume'
                      ? 'e.g., 5000 (for 5L)'
                      : 'e.g., 50'
                  }
                  required
                />
              </div>

              {/* Total Cost */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Total Cost (₱) <span className="text-surface-500 text-xs">for the entire quantity</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500">₱</span>
                <input
                    type="text"
                    inputMode="decimal"
                    value={formData.totalCost}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setFormData((prev) => ({ ...prev, totalCost: val }))
                      }
                    }}
                    className="w-full pl-8 pr-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white font-mono"
                    placeholder="e.g., 5000"
                    required
                  />
                </div>
              </div>

              {/* Per Unit Cost Preview */}
              <div className="p-4 bg-surface-800/50 rounded-lg border border-surface-700">
                <div className="flex justify-between items-center">
                  <span className="text-surface-400">
                    Cost per {getUnitLabel(formData.unit_type)}:
                  </span>
                  <span className="font-mono font-bold text-primary-500 text-lg">
                    ₱{perUnitCost.toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : editingItem ? 'Update Item' : 'Add Item'}
              </button>

              {editingItem && (
                <button
                  type="button"
                  onClick={() => openDeleteConfirm(editingItem)}
                  className="w-full py-2 text-red-400 hover:text-red-300 text-sm"
                >
                  Delete Item
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Save Product Modal */}
      {showProductSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Save New Product</h2>
              <button onClick={closeProductSaveModal} className="text-surface-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Product Image */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Product Image (optional)
                </label>
                <div
                  onClick={() => productFileInputRef.current?.click()}
                  className="w-full aspect-video bg-surface-800 border-2 border-dashed border-surface-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-primary-500/50 transition-colors overflow-hidden"
                >
                  {productImagePreview ? (
                    <img
                      src={productImagePreview}
                      alt="Preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <svg
                        className="w-8 h-8 text-surface-500 mx-auto mb-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <p className="text-surface-500 text-sm">Click to upload</p>
                    </div>
                  )}
                </div>
                <input
                  ref={productFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProductImageChange}
                  className="hidden"
                />
              </div>

              {/* Product Name */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Product Name
                </label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white"
                  placeholder="Enter product name"
                />
              </div>

              {/* Ingredients Summary */}
              <div className="p-3 bg-surface-800/50 rounded-lg">
                <p className="text-surface-400 text-sm mb-2">Ingredients:</p>
                <ul className="text-white text-sm space-y-1">
                  {productCreation.map((pc) => (
                    <li key={pc.item.id} className="flex justify-between">
                      <span>
                        {pc.item.name} ({pc.qty} {getUnitLabel(pc.item.unit_type)})
                      </span>
                      <span className="text-surface-400">₱{(pc.item.cost * pc.qty).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Cost Breakdown */}
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-yellow-400 font-medium">Ingredient Cost:</span>
                  <span className="text-yellow-400 font-mono font-bold">₱{ingredientCost.toFixed(2)}</span>
                </div>
                <p className="text-yellow-400/60 text-xs">⚠️ This is a Pre-OPEX calculation</p>
              </div>

              {/* Selling Price */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Selling Price (₱)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500">₱</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={productSellingPrice}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setProductSellingPrice(val)
                      }
                    }}
                    className="w-full pl-8 pr-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white font-mono"
                    placeholder="Enter selling price"
                  />
                </div>
              </div>

              {/* Profit Preview */}
              <div className="p-3 bg-surface-800/50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-surface-400">Gross Profit per unit:</span>
                  <span
                    className={`font-mono font-bold ${grossProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}
                  >
                    ₱{grossProfit.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveProduct}
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Item?</h3>
            <p className="text-surface-400 text-sm mb-4">
              Are you sure you want to delete <strong className="text-white">{deletingItem.name}</strong>? 
              This will remove the item from inventory.
            </p>
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
              <p className="text-red-400 text-sm">
                ⚠️ This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeletingItem(null)
                }}
                className="flex-1 px-4 py-2 text-surface-400 hover:text-white hover:bg-surface-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
