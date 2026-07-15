'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ users: 0, ads: 0, stores: 0 });
  const router = useRouter();

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/admin/login');
        return;
      }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();
      if (profile?.is_admin !== true) {
        router.push('/admin/login');
      }
    };

    const fetchStats = async () => {
      const { count: users } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true });
      const { count: ads } = await supabase
        .from('ads')
        .select('*', { count: 'exact', head: true });
      const { count: stores } = await supabase
        .from('stores')
        .select('*', { count: 'exact', head: true });
      setStats({ users: users || 0, ads: ads || 0, stores: stores || 0 });
    };

    checkAdmin();
    fetchStats();
  }, [router]);

  
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">لوحة التحكم</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold">المستخدمين</h3>
          <p className="text-3xl font-bold">{stats.users}</p>
          <Link href="/admin/users" className="text-blue-600 hover:underline">عرض الكل</Link>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold">الإعلانات</h3>
          <p className="text-3xl font-bold">{stats.ads}</p>
          <Link href="/admin/ads" className="text-blue-600 hover:underline">عرض الكل</Link>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold">المتاجر</h3>
          <p className="text-3xl font-bold">{stats.stores}</p>
          <Link href="/admin/stores" className="text-blue-600 hover:underline">عرض الكل</Link>
        </div>
      </div>
    </div>
  );
}
