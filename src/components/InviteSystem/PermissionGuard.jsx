import { useState, useEffect } from 'react';
import { apiRequest } from '../../services/api';
import { Lock, AlertCircle } from 'lucide-react';

export function PermissionGuard({ permission, children, fallback }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermission = async () => {
      try {
        const response = await apiRequest(`/api/permissions/check?permission=${permission}`);
        setHasPermission(response.has_permission);
      } catch (err) {
        setHasPermission(false);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [permission]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasPermission) {
    if (fallback) {
      return fallback;
    }
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <Lock className="w-12 h-12 text-gray-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-300 mb-2">权限不足</h3>
        <p className="text-gray-500 text-sm text-center max-w-xs">
          您需要获得相应的权限才能访问此功能。请联系管理员获取邀请码。
        </p>
      </div>
    );
  }

  return children;
}

export function RequireSocialPermission({ children }) {
  return (
    <PermissionGuard
      permission="social.post"
      fallback={
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <AlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">社交功能未解锁</h3>
          <p className="text-gray-500 text-sm text-center max-w-xs">
            社交功能默认关闭，需要使用邀请码解锁后才能使用。
          </p>
        </div>
      }
    >
      {children}
    </PermissionGuard>
  );
}
