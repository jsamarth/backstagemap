import { useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_THOUGHTS = 500;

export function FeedbackModal({ open, onOpenChange }: FeedbackModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [thoughts, setThoughts] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const validateEmail = (value: string) => {
    if (value && !EMAIL_RE.test(value)) {
      setEmailError("Please enter a valid email address.");
    } else {
      setEmailError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thoughts.trim() || !name.trim() || !email.trim()) return;
    if (!EMAIL_RE.test(email)) { setEmailError("Please enter a valid email address."); return; }
    setLoading(true);
    const { error } = await supabase.from("feedback").insert({
      name: name.trim(),
      email: email.trim(),
      thoughts: thoughts.trim(),
    } as never);
    setLoading(false);
    if (error) {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
      return;
    }
    toast({ title: "Thanks!", description: "Your feedback has been received." });
    onOpenChange(false);
    setName("");
    setEmail("");
    setThoughts("");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Like this app? Hate it?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            Let us know your thoughts and requests — every bit of feedback helps.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3 mt-1">
            <Input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <div className="space-y-1">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); validateEmail(e.target.value); }}
                onBlur={(e) => validateEmail(e.target.value)}
                required
              />
              {emailError && <p className="text-xs text-destructive">{emailError}</p>}
            </div>
            <div className="space-y-1">
              <Textarea
                placeholder="Your thoughts…"
                value={thoughts}
                onChange={(e) => setThoughts(e.target.value.slice(0, MAX_THOUGHTS))}
                required
                rows={4}
              />
              <p className={`text-xs text-right ${thoughts.length >= MAX_THOUGHTS ? "text-destructive" : "text-muted-foreground"}`}>
                {thoughts.length}/{MAX_THOUGHTS}
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !thoughts.trim() || !name.trim() || !email.trim() || !!emailError}>
              {loading ? "Submitting…" : "Send feedback"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-2">
            <Link
              to="/privacy"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
              onClick={() => onOpenChange(false)}
            >
              Privacy Policy
            </Link>
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
