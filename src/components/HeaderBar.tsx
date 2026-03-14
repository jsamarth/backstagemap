import { User, LogOut, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { User as AuthUser } from "@supabase/supabase-js";

interface HeaderBarProps {
  user: AuthUser | null;
  onLoginClick: () => void;
  onSignupClick: () => void;
  onLogout: () => void;
  onSavedClick: () => void;
  savedCount: number;
}

export function HeaderBar({ user, onLoginClick, onSignupClick, onLogout, onSavedClick, savedCount }: HeaderBarProps) {
  return (
    <div className="absolute top-4 right-4 z-20 hidden sm:flex items-center gap-2">
      {user ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full bg-card/80 backdrop-blur-md border border-border gap-1.5 text-xs font-body text-muted-foreground hover:text-foreground"
            onClick={onSavedClick}
          >
            <Bookmark className="w-3.5 h-3.5" />
            Saved{savedCount > 0 && ` (${savedCount})`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full bg-card/80 backdrop-blur-md border border-border gap-1.5 text-xs font-body text-muted-foreground hover:text-foreground"
            onClick={onLogout}
          >
            <LogOut className="w-3.5 h-3.5" />
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full bg-card/80 backdrop-blur-md border border-border text-xs font-body text-muted-foreground hover:text-foreground"
            onClick={onLoginClick}
          >
            Log In
          </Button>
          <Button
            size="sm"
            className="rounded-full text-xs font-body"
            onClick={onSignupClick}
          >
            Sign Up
          </Button>
        </>
      )}
    </div>
  );
}
