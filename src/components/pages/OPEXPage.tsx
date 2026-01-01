'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Opex } from '@/types/database'
import toast from 'react-hot-toast'

interface OpexSettings {
  id: string
  target_monthly_sales: number
}

export default function OPEXPage() {
  const [opexItems, setOpexItems] = useState<Opex[]>([])
  const [settings, setSettings] = useState<OpexSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Opex | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    monthly_cost: '',
  })

  // Target sales input
  const [targetSales, setTargetSales] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const [opexRes, settingsRes] = await Promise.all([
        supabase.from('opex').select('*').order('name'),
        supabase.from('opex_settings').select('*').limit(1).single(),
      ])

      if (opexRes.data) setOpexItems(opexRes.data)
      if (settingsRes.data) {
        setSettings(settingsRes.data)
        setTargetSales(settingsRes.data.target_monthly_sales.toString())
      }
    } catch (error) {
      console.error('Error fetching OPEX data:', error)
      // Tables might not exist yet
      setOpexItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Calculate totals
  const totalMonthlyOpex = opexItems.reduce((sum, item) => sum + item.monthly_cost, 0)
  const targetSalesNum = parseInt(targetSales) || 0
  const opexPerUnit = targetSalesNum > 0 ? totalMonthlyOpex / targetSalesNum : 0

  const resetForm = () => {
    setFormData({ name: '', monthly_cost: '' })
  }

  const openAddModal = () => {
    resetForm()
    setEditingItem(null)
    setShowAddModal(true)
  }

  const openEditModal = (item: Opex) => {
    setFormData({
      name: item.name,
      monthly_cost: item.monthly_cost.toString(),
    })
    setEditingItem(item)
    setShowAddModal(true)
  }

  const closeModal = () => {
    setShowAddModal(false)
    setEditingItem(null)
    resetForm()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Please enter an expense name')
      return
    }

    const cost = parseFloat(formData.monthly_cost) || 0
    if (cost <= 0) {
      toast.error('Please enter a valid monthly cost')
      return
    }

    setIsSubmitting(true)

    try {
      const opexData = {
        name: formData.name.trim(),
        monthly_cost: cost,
      }

      if (editingItem) {
        const { error } = await (supabase as any)
          .from('opex')
          .update(opexData)
          .eq('id', editingItem.id)

        if (error) throw error
        toast.success('Expense updated!')
      } else {
        const { error } = await (supabase as any)
          .from('opex')
          .insert(opexData)

        if (error) throw error
        toast.success('Expense added!')
      }

      closeModal()
      fetchData()
    } catch (error) {
      console.error('Error saving expense:', error)
      toast.error('Failed to save expense. Make sure the database tables exist.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (item: Opex) => {
    if (!confirm(`Delete "${item.name}"?`)) return

    try {
      const { error } = await (supabase as any)
        .from('opex')
        .delete()
        .eq('id', item.id)

      if (error) throw error
      toast.success('Expense deleted')
      fetchData()
    } catch (error) {
      console.error('Error deleting expense:', error)
      toast.error('Failed to delete expense')
    }
  }

  const handleUpdateTargetSales = async () => {
    const target = parseInt(targetSales) || 0
    if (target <= 0) {
      toast.error('Please enter a valid target')
      return
    }

    try {
      if (settings) {
        const { error } = await (supabase as any)
          .from('opex_settings')
          .update({ target_monthly_sales: target })
          .eq('id', settings.id)

        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from('opex_settings')
          .insert({ target_monthly_sales: target })

        if (error) throw error
      }

      toast.success('Target updated!')
      fetchData()
    } catch (error) {
      console.error('Error updating target:', error)
      toast.error('Failed to update target')
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
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Operating Expenses</h1>
          <p className="text-surface-400 text-sm mt-1">Manage monthly operating costs</p>
        </div>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Expense
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-surface-400 text-sm mb-1">Total Monthly OPEX</p>
          <p className="text-2xl font-bold text-red-400 font-mono">₱{totalMonthlyOpex.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="card p-4">
          <p className="text-surface-400 text-sm mb-1">Target Monthly Sales</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={targetSales}
              onChange={(e) => setTargetSales(e.target.value)}
              className="w-24 px-3 py-1 bg-surface-800 border border-surface-700 rounded text-white font-mono text-lg"
              min={1}
            />
            <span className="text-surface-400">units</span>
            <button
              onClick={handleUpdateTargetSales}
              className="ml-auto px-3 py-1 bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 rounded text-sm"
            >
              Save
            </button>
          </div>
        </div>
        <div className="card p-4 bg-primary-500/10 border-primary-500/20">
          <p className="text-surface-400 text-sm mb-1">OPEX Cost per Unit</p>
          <p className="text-2xl font-bold text-primary-500 font-mono">₱{opexPerUnit.toFixed(2)}</p>
          <p className="text-xs text-surface-500 mt-1">Added to each product&apos;s cost</p>
        </div>
      </div>

      {/* Info */}
      <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <p className="text-blue-400 text-sm">
          💡 <strong>How it works:</strong> Total Monthly OPEX ÷ Target Sales = OPEX per unit. 
          This amount is automatically added to each product&apos;s cost calculation.
        </p>
      </div>

      {/* OPEX Items List */}
      {opexItems.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-12 h-12 text-surface-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-medium text-white mb-2">No operating expenses yet</h3>
          <p className="text-surface-400 text-sm">Add expenses like rent, electricity, salaries, etc.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-800 bg-surface-800/50">
                <th className="p-4 text-left text-sm font-medium text-surface-400">Expense Name</th>
                <th className="p-4 text-right text-sm font-medium text-surface-400">Monthly Cost</th>
                <th className="p-4 text-right text-sm font-medium text-surface-400">% of Total</th>
                <th className="p-4 text-center text-sm font-medium text-surface-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {opexItems.map((item) => (
                <tr key={item.id} className="border-b border-surface-800/50 hover:bg-surface-800/30">
                  <td className="p-4 text-white font-medium">{item.name}</td>
                  <td className="p-4 text-right text-red-400 font-mono font-bold">
                    ₱{item.monthly_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-right text-surface-400 font-mono">
                    {totalMonthlyOpex > 0 ? ((item.monthly_cost / totalMonthlyOpex) * 100).toFixed(1) : 0}%
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-2 text-surface-400 hover:text-white hover:bg-surface-800 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {/* Total Row */}
              <tr className="bg-surface-800/50">
                <td className="p-4 text-white font-bold">Total</td>
                <td className="p-4 text-right text-red-400 font-mono font-bold text-lg">
                  ₱{totalMonthlyOpex.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="p-4 text-right text-surface-400 font-mono">100%</td>
                <td className="p-4"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingItem ? 'Edit Expense' : 'Add New Expense'}
              </h2>
              <button onClick={closeModal} className="text-surface-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Expense Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white"
                  placeholder="e.g., Rent, Electricity, Salaries"
                  required
                />
              </div>

              {/* Monthly Cost */}
              <div>
                <label className="block text-sm font-medium text-surface-300 mb-2">
                  Monthly Cost (₱)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-500">₱</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData.monthly_cost}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '' || /^\d*\.?\d*$/.test(val)) {
                        setFormData((prev) => ({ ...prev, monthly_cost: val }))
                      }
                    }}
                    className="w-full pl-8 pr-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-white font-mono"
                    placeholder="e.g., 15000"
                    required
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : editingItem ? 'Update Expense' : 'Add Expense'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

