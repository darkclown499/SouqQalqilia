import { useEffect } from 'react';
import { useRouter } from 'expo-router';

// This file redirects to the main admin panel (app/admin/index.tsx)
export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/index' as any);
  }, []);

  return null;
}
