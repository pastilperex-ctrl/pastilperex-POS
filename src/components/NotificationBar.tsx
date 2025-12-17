'use client'

import { useState, useEffect } from 'react'
import { useNotifications } from '@/contexts/NotificationContext'

export default function NotificationBar() {
  const { recentSales, cancelSale, storageWarning } = useNotifications()
  const [showCancelModal, setShowCancelModal] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<Record<string, number>>({})

  // Update countdown timers
  useEffect(() => {
    const interval = setInterval(() => {
      const newTimeLeft: Record<string, number> = {}
      recentSales.forEach((rs) => {
        const remaining = Math.max(0, Math.floor((rs.expiresAt - Date.now()) / 1000))
        newTimeLeft[rs.sale.id] = remaining
      })
      setTimeLeft(newTimeLeft)
    }, 1000)

    return () => clearInterval(interval)
  }, [recentSales])

  const handleCancelClick = (saleId: string) => {
    setShowCancelModal(saleId)
  }

  const handleConfirmCancel = async () => {
    if (showCancelModal) {
      await cancelSale(showCancelModal)
      setShowCancelModal(null)
    }
  }

  return (
    <>
      {/* Storage Warning - Top most */}
      {storageWarning && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 notification-enter">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm text-red-400 font-medium">{storageWarning}</span>
          </div>
        </div>
      )}

      {/* New Purchase Notifications */}
      {recentSales.map((rs) => (
        <div
          key={rs.sale.id}
          className="bg-green-500/10 border-b border-green-500/20 px-4 py-2 notification-enter"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full pulse-glow" />
              <span className="text-sm text-green-400 font-medium">
                New Purchase: {rs.sale.product_name} x{rs.sale.qty}
              </span>
              <span className="text-xs text-surface-500">
                ({timeLeft[rs.sale.id] || 0}s left to cancel)
              </span>
            </div>
            <button
              onClick={() => handleCancelClick(rs.sale.id)}
              className="px-3 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ))}

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-2">Cancel Purchase?</h3>
            <p className="text-surface-400 text-sm mb-6">
              This will remove the sale from reports and restore the inventory. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(null)}
                className="flex-1 px-4 py-2 text-surface-400 hover:text-white hover:bg-surface-800 rounded-lg transition-colors"
              >
                Keep Sale
              </button>
              <button
                onClick={handleConfirmCancel}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
              >
                Cancel Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}



