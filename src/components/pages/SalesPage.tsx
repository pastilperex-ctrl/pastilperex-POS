'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, getProductImageUrl } from '@/lib/supabase'
import { Product, PaymentMethod, CustomerType, Setting } from '@/types/database'
import { useNotifications } from '@/contexts/NotificationContext'
import toast from 'react-hot-toast'

export default function SalesPage() {
  const { addRecentSale } = useNotifications()
  const [products, setProducts] = useState<Product[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [customerTypes, setCustomerTypes] = useState<CustomerType[]>([])
  const [dineInEnabled, setDineInEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  // Selected product state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('')
  const [selectedCustomerType, setSelectedCustomerType] = useState<string>('')
  const [selectedDineInTakeout, setSelectedDineInTakeout] = useState<'dine_in' | 'takeout' | null>(null)
  const [quantity, setQuantity] = useState<number>(1)
  const [isCheckingOut, setIsCheckingOut] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [productsRes, paymentRes, customerRes, settingsRes] = await Promise.all([
        supabase.from('products').select('*').gt('qty', 0).order('name'),
        supabase.from('payment_methods').select('*').order('name'),
        supabase.from('customer_types').select('*').order('name'),
        supabase.from('settings').select('*').eq('key', 'dine_in_takeout_enabled'),
      ])

      if (productsRes.data) setProducts(productsRes.data)
      if (paymentRes.data) setPaymentMethods(paymentRes.data)
      if (customerRes.data) setCustomerTypes(customerRes.data)
      if (settingsRes.data && settingsRes.data[0]) {
        setDineInEnabled(settingsRes.data[0].value === 'true')
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product)
    setQuantity(product.unit_type === 'weight' ? 0.5 : 1)
    setSelectedPaymentMethod('')
    setSelectedCustomerType('')
    setSelectedDineInTakeout(dineInEnabled ? null : null)
  }

  const closeProductModal = () => {
    setSelectedProduct(null)
    setQuantity(1)
    setSelectedPaymentMethod('')
    setSelectedCustomerType('')
    setSelectedDineInTakeout(null)
  }

  const handleCheckout = async () => {
    if (!selectedProduct) return
    if (!selectedPaymentMethod) {
      toast.error('Please select a payment method')
      return
    }
    if (!selectedCustomerType) {
      toast.error('Please select a customer type')
      return
    }
    if (dineInEnabled && !selectedDineInTakeout) {
      toast.error('Please select Dine In or Takeout')
      return
    }
    if (quantity <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }
    if (quantity > selectedProduct.qty) {
      toast.error('Not enough stock available')
      return
    }

    setIsCheckingOut(true)

    try {
      const total = quantity * selectedProduct.selling_price

      // Create sale record
      const saleRecord: Record<string, any> = {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        qty: quantity,
        unit_type: selectedProduct.unit_type,
        cost: selectedProduct.cost,
        selling_price: selectedProduct.selling_price,
        total,
        payment_method: selectedPaymentMethod,
        customer_type: selectedCustomerType,
        dine_in_takeout: dineInEnabled ? selectedDineInTakeout : null,
      }
      
      const { data: saleData, error: saleError } = await (supabase as any)
        .from('sales')
        .insert(saleRecord)
        .select()
        .single()

      if (saleError) throw saleError

      // Update inventory
      const { error: inventoryError } = await (supabase as any)
        .from('products')
        .update({ qty: selectedProduct.qty - quantity })
        .eq('id', selectedProduct.id)

      if (inventoryError) throw inventoryError

      // Add to recent sales for notification
      addRecentSale(saleData)

      toast.success('Sale completed!')
      closeProductModal()
      fetchData() // Refresh products
    } catch (error) {
      console.error('Error processing sale:', error)
      toast.error('Failed to process sale')
    } finally {
      setIsCheckingOut(false)
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Sales</h1>
        <p className="text-surface-400 text-sm mt-1">Select a product to start a sale</p>
      </div>

      {/* Products Grid */}
      {products.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-12 h-12 text-surface-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No products available</h3>
          <p className="text-surface-400 text-sm">Add products in the Inventory section first</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => handleProductClick(product)}
              className="card p-4 text-left hover:border-primary-500/50 transition-all group"
            >
              {/* Product Image */}
              <div className="aspect-square bg-surface-800 rounded-lg mb-3 overflow-hidden">
                {product.image_url ? (
                  <img
                    src={getProductImageUrl(product.image_url) || ''}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Product Info */}
              <h3 className="font-medium text-white truncate mb-1">{product.name}</h3>
              <p className="text-primary-500 font-bold">₱{product.selling_price.toFixed(2)}</p>
              <p className="text-xs text-surface-500 mt-1">
                Stock: {product.qty} {product.unit_type === 'weight' ? 'kg' : 'pcs'}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Product Sale Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-surface-800 rounded-lg overflow-hidden flex-shrink-0">
                  {selectedProduct.image_url ? (
                    <img
                      src={getProductImageUrl(selectedProduct.image_url) || ''}
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedProduct.name}</h2>
                  <p className="text-primary-500 font-bold text-lg">₱{selectedProduct.selling_price.toFixed(2)}</p>
                </div>
              </div>
              <button
                onClick={closeProductModal}
                className="text-surface-400 hover:text-white p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Customer Type */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-surface-300 mb-2">Customer Type</label>
              <div className="flex flex-wrap gap-2">
                {customerTypes.length === 0 ? (
                  <p className="text-surface-500 text-sm">No customer types configured. Add them in Settings.</p>
                ) : (
                  customerTypes.map((ct) => (
                    <button
                      key={ct.id}
                      onClick={() => setSelectedCustomerType(ct.name)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        selectedCustomerType === ct.name
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141416]'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: ct.color, color: '#fff' }}
                    >
                      {ct.name}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-surface-300 mb-2">Payment Method</label>
              <div className="flex flex-wrap gap-2">
                {paymentMethods.length === 0 ? (
                  <p className="text-surface-500 text-sm">No payment methods configured. Add them in Settings.</p>
                ) : (
                  paymentMethods.map((pm) => (
                    <button
                      key={pm.id}
                      onClick={() => setSelectedPaymentMethod(pm.name)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        selectedPaymentMethod === pm.name
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-[#141416]'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: pm.color, color: '#fff' }}
                    >
                      {pm.name}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Quantity */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-surface-300 mb-2">
                Quantity ({selectedProduct.unit_type === 'weight' ? 'kg' : 'pcs'})
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity((q) => Math.max(selectedProduct.unit_type === 'weight' ? 0.1 : 1, q - (selectedProduct.unit_type === 'weight' ? 0.1 : 1)))}
                  className="w-10 h-10 rounded-lg bg-surface-800 hover:bg-surface-700 text-white flex items-center justify-center"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(0, parseFloat(e.target.value) || 0))}
                  step={selectedProduct.unit_type === 'weight' ? 0.1 : 1}
                  min={selectedProduct.unit_type === 'weight' ? 0.1 : 1}
                  max={selectedProduct.qty}
                  className="flex-1 px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white text-center font-mono text-lg"
                />
                <button
                  onClick={() => setQuantity((q) => Math.min(selectedProduct.qty, q + (selectedProduct.unit_type === 'weight' ? 0.1 : 1)))}
                  className="w-10 h-10 rounded-lg bg-surface-800 hover:bg-surface-700 text-white flex items-center justify-center"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-surface-500 mt-1">
                Available: {selectedProduct.qty} {selectedProduct.unit_type === 'weight' ? 'kg' : 'pcs'}
              </p>
            </div>

            {/* Dine In / Takeout */}
            {dineInEnabled && (
              <div className="mb-5">
                <label className="block text-sm font-medium text-surface-300 mb-2">Dine In / Takeout</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedDineInTakeout('dine_in')}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                      selectedDineInTakeout === 'dine_in'
                        ? 'bg-blue-500 text-white'
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    🍽️ Dine In
                  </button>
                  <button
                    onClick={() => setSelectedDineInTakeout('takeout')}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                      selectedDineInTakeout === 'takeout'
                        ? 'bg-green-500 text-white'
                        : 'bg-surface-800 text-surface-400 hover:bg-surface-700'
                    }`}
                  >
                    🥡 Takeout
                  </button>
                </div>
              </div>
            )}

            {/* Total & Checkout */}
            <div className="mt-6 pt-4 border-t border-surface-800">
              <div className="flex items-center justify-between mb-4">
                <span className="text-surface-400">Total</span>
                <span className="text-2xl font-bold text-primary-500">
                  ₱{(quantity * selectedProduct.selling_price).toFixed(2)}
                </span>
              </div>
              <button
                onClick={handleCheckout}
                disabled={isCheckingOut || !selectedPaymentMethod || !selectedCustomerType || (dineInEnabled && !selectedDineInTakeout)}
                className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingOut ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  'Checkout'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


