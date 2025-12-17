'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, getProductImageUrl, PRODUCT_IMAGES_BUCKET } from '@/lib/supabase'
import { Product } from '@/types/database'
import imageCompression from 'browser-image-compression'
import toast from 'react-hot-toast'

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    unit_type: 'quantity' as 'weight' | 'quantity',
    qty: 0,
    cost: 0,
    selling_price: 0,
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const fetchProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name')

      if (error) throw error
      setProducts(data || [])
    } catch (error) {
      console.error('Error fetching products:', error)
      toast.error('Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const resetForm = () => {
    setFormData({
      name: '',
      unit_type: 'quantity',
      qty: 0,
      cost: 0,
      selling_price: 0,
    })
    setImageFile(null)
    setImagePreview(null)
  }

  const openAddModal = () => {
    resetForm()
    setEditingProduct(null)
    setShowAddModal(true)
  }

  const openEditModal = (product: Product) => {
    setFormData({
      name: product.name,
      unit_type: product.unit_type,
      qty: product.qty,
      cost: product.cost,
      selling_price: product.selling_price,
    })
    setImagePreview(product.image_url ? getProductImageUrl(product.image_url) : null)
    setImageFile(null)
    setEditingProduct(product)
    setShowAddModal(true)
  }

  const closeModal = () => {
    setShowAddModal(false)
    setEditingProduct(null)
    resetForm()
  }

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      // Compress image to max 100x100px and 150KB
      const options = {
        maxSizeMB: 0.15, // 150KB
        maxWidthOrHeight: 100,
        useWebWorker: true,
      }

      const compressedFile = await imageCompression(file, options)
      setImageFile(compressedFile)

      // Create preview
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
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`

      const { error, data } = await (supabase as any).storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error('Upload error:', error)
        toast.error(`Upload failed: ${error.message}`)
        return null
      }
      
      console.log('Upload success:', data)
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
      toast.error('Please enter a product name')
      return
    }

    setIsSubmitting(true)

    try {
      let imagePath = editingProduct?.image_url || null

      // Upload new image if selected
      if (imageFile) {
        const uploadedPath = await uploadImage(imageFile)
        if (uploadedPath) {
          // Delete old image if exists
          if (editingProduct?.image_url) {
            await (supabase as any).storage
              .from(PRODUCT_IMAGES_BUCKET)
              .remove([editingProduct.image_url])
          }
          imagePath = uploadedPath
        }
      }

      const productData: Record<string, any> = {
        name: formData.name,
        unit_type: formData.unit_type,
        qty: formData.qty,
        cost: formData.cost,
        selling_price: formData.selling_price,
        image_url: imagePath,
      }

      if (editingProduct) {
        // Update existing product
        const { error } = await (supabase as any)
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id)

        if (error) throw error
        toast.success('Product updated!')
      } else {
        // Create new product
        const { error } = await (supabase as any)
          .from('products')
          .insert(productData)

        if (error) throw error
        toast.success('Product added!')
      }

      closeModal()
      fetchProducts()
    } catch (error) {
      console.error('Error saving product:', error)
      toast.error('Failed to save product')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"?`)) return

    try {
      // Delete image if exists
      if (product.image_url) {
        await (supabase as any).storage
          .from(PRODUCT_IMAGES_BUCKET)
          .remove([product.image_url])
      }

      const { error } = await (supabase as any)
        .from('products')
        .delete()
        .eq('id', product.id)

      if (error) throw error
      toast.success('Product deleted')
      fetchProducts()
    } catch (error) {
      console.error('Error deleting product:', error)
      toast.error('Failed to delete product')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-surface-400 text-sm mt-1">Manage your products</p>
        </div>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Product
        </button>
      </div>

      {products.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-12 h-12 text-surface-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No products yet</h3>
          <p className="text-surface-400 text-sm">Add your first product to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((product) => (
            <div key={product.id} className="card p-4">
              {/* Product Image */}
              <div className="aspect-square bg-surface-800 rounded-lg mb-3 overflow-hidden">
                {product.image_url ? (
                  <img
                    src={getProductImageUrl(product.image_url) || ''}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-12 h-12 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Product Info */}
              <h3 className="font-semibold text-white mb-2">{product.name}</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-surface-400">Stock:</span>
                  <span className="text-white font-mono">
                    {product.qty} {product.unit_type === 'weight' ? 'kg' : 'pcs'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-400">Cost:</span>
                  <span className="text-white font-mono">₱{product.cost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-surface-400">Price:</span>
                  <span className="text-primary-500 font-bold font-mono">₱{product.selling_price.toFixed(2)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4 pt-4 border-t border-surface-800">
                <button
                  onClick={() => openEditModal(product)}
                  className="flex-1 px-3 py-2 text-sm text-surface-400 hover:text-white hover:bg-surface-800 rounded-lg transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(product)}
                  className="flex-1 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
              <button onClick={closeModal} className="text-surface-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Product Image (optional)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-video bg-surface-800 border-2 border-dashed border-surface-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-primary-500/50 transition-colors overflow-hidden"
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center p-4">
                      <svg className="w-8 h-8 text-surface-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Product Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white"
                  placeholder="Enter product name"
                  required
                />
              </div>

              {/* Unit Type */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Unit Type
                </label>
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
                    Quantity (pcs)
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
                    Weight (kg)
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Stock ({formData.unit_type === 'weight' ? 'kg' : 'pcs'})
                </label>
                <input
                  type="number"
                  value={formData.qty}
                  onChange={(e) => setFormData((prev) => ({ ...prev, qty: parseFloat(e.target.value) || 0 }))}
                  step={formData.unit_type === 'weight' ? 0.1 : 1}
                  min={0}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white font-mono"
                />
              </div>

              {/* Cost */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Cost (₱)
                </label>
                <input
                  type="number"
                  value={formData.cost}
                  onChange={(e) => setFormData((prev) => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                  step={0.01}
                  min={0}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white font-mono"
                />
              </div>

              {/* Selling Price */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Selling Price (₱)
                </label>
                <input
                  type="number"
                  value={formData.selling_price}
                  onChange={(e) => setFormData((prev) => ({ ...prev, selling_price: parseFloat(e.target.value) || 0 }))}
                  step={0.01}
                  min={0}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white font-mono"
                />
              </div>

              {/* Profit Preview */}
              <div className="p-3 bg-surface-800/50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-surface-400">Profit per unit:</span>
                  <span className={`font-mono font-bold ${formData.selling_price - formData.cost >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ₱{(formData.selling_price - formData.cost).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : editingProduct ? 'Update Product' : 'Add Product'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


