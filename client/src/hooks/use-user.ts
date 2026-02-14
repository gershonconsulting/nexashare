import { useAuth } from "@/context/AuthContext";

export function useUser() {
  const { user, checkAuth, logout } = useAuth();

  return {
    user,
    refreshUser: checkAuth,
    logout,
  };
}
