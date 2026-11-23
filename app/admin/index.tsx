import { Redirect } from 'expo-router';

import { ADMIN } from '@/src/admin/ui';

/** Кабинет открывается с раздела «Семьи». */
export default function AdminIndex() {
  return <Redirect href={ADMIN.families} />;
}
