'use client'

import { useAuth } from './AuthProvider'

export type AdminGateProps = {
  children: React.ReactNode
  fallback?: React.ReactNode
}

/** 包裹管理功能：未登录或会话尚未恢复完成时渲染 fallback */
export function AdminGate({ children, fallback = null }: AdminGateProps) {
  const { ready, isAdmin } = useAuth()
  if (!ready || !isAdmin) return <>{fallback}</>
  return <>{children}</>
}
