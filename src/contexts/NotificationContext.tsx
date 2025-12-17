'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { RecentSale, Sale } from '@/types/database'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

interface NotificationContextType {
  recentSales: RecentSale[]
  addRecentSale: (sale: Sale) => void
  cancelSale: (saleId: string) => Promise<boolean>
  removeRecentSale: (saleId: string) => void
  storageWarning: string | null
  checkStorage: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

const CANCEL_WINDOW_MS = 30000 // 30 seconds

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [storageWarning, setStorageWarning] = useState<string | null>(null)

  const addRecentSale = useCallback((sale: Sale) => {
    const expiresAt = Date.now() + CANCEL_WINDOW_MS
    
    // Only keep ONE notification at a time - replace previous with new one
    setRecentSales([{ sale, expiresAt }])

    // Auto-remove after expiry
    setTimeout(() => {
      setRecentSales((prev) => prev.filter((rs) => rs.sale.id !== sale.id))
    }, CANCEL_WINDOW_MS)
  }, [])

  const cancelSale = useCallback(async (saleId: string): Promise<boolean> => {
    const recentSale = recentSales.find((rs) => rs.sale.id === saleId)
    if (!recentSale) {
      toast.error('Sale cannot be cancelled - time expired')
      return false
    }

    if (Date.now() > recentSale.expiresAt) {
      setRecentSales((prev) => prev.filter((rs) => rs.sale.id !== saleId))
      toast.error('Sale cannot be cancelled - time expired')
      return false
    }

    try {
      // Mark sale as cancelled
      const { error: saleError } = await (supabase as any)
        .from('sales')
        .update({ cancelled: true, cancelled_at: new Date().toISOString() })
        .eq('id', saleId)

      if (saleError) throw saleError

      // Restore inventory
      const { error: inventoryError } = await (supabase as any).rpc('restore_inventory', {
        p_product_id: recentSale.sale.product_id,
        p_qty: recentSale.sale.qty
      })

      if (inventoryError) {
        // Fallback: direct update
        const { data: product } = await (supabase as any)
          .from('products')
          .select('qty')
          .eq('id', recentSale.sale.product_id)
          .single()

        if (product) {
          await (supabase as any)
            .from('products')
            .update({ qty: product.qty + recentSale.sale.qty })
            .eq('id', recentSale.sale.product_id)
        }
      }

      setRecentSales((prev) => prev.filter((rs) => rs.sale.id !== saleId))
      toast.success('Sale cancelled and inventory restored')
      return true
    } catch (error) {
      console.error('Error cancelling sale:', error)
      toast.error('Failed to cancel sale')
      return false
    }
  }, [recentSales])

  const removeRecentSale = useCallback((saleId: string) => {
    setRecentSales((prev) => prev.filter((rs) => rs.sale.id !== saleId))
  }, [])

  const checkStorage = useCallback(async () => {
    try {
      // Check Supabase storage usage (simplified - checking product images bucket)
      const { data, error } = await supabase.storage.from('product-images').list()
      
      if (error) {
        // Bucket might not exist yet
        setStorageWarning(null)
        return
      }

      // Estimate storage used (rough calculation)
      // Supabase free tier has 1GB storage
      const estimatedSize = (data?.length || 0) * 150000 // Assume 150KB per image max
      const usedMB = estimatedSize / (1024 * 1024)
      const limitMB = 1000 // 1GB limit for free tier
      const remainingMB = limitMB - usedMB

      if (remainingMB < 20) {
        setStorageWarning(`Warning: Low storage! Only ${remainingMB.toFixed(1)} MB left!`)
      } else if (remainingMB < 50) {
        setStorageWarning(`Storage notice: ${remainingMB.toFixed(1)} MB remaining`)
      } else {
        setStorageWarning(null)
      }
    } catch (error) {
      console.error('Error checking storage:', error)
      setStorageWarning(null)
    }
  }, [])

  return (
    <NotificationContext.Provider
      value={{
        recentSales,
        addRecentSale,
        cancelSale,
        removeRecentSale,
        storageWarning,
        checkStorage,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}


