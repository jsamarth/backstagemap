import type { User as AuthUser } from "@supabase/supabase-js";

interface HeaderBarProps {
  user: AuthUser | null;
  onLoginClick: () => void;
  onSignupClick: () => void;
  onLogout: () => void;
  onSavedClick: () => void;
  savedCount: number;
}

export function HeaderBar(_props: HeaderBarProps) {
  return null;
}
