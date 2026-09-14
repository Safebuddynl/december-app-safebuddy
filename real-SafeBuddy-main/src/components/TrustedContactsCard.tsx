import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Mail, Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addContact,
  listContacts,
  removeContact,
  updateContact,
  type TrustedContact,
} from "@/lib/trips";
import { cn } from "@/lib/utils";

/**
 * Noodcontacten: de mensen die een gedeelde rit kunnen volgen en die de
 * laatste locatie krijgen als een check-in uitblijft.
 *
 * Alles loopt via `trusted_contacts`; row level security zorgt dat iemand
 * alleen zijn eigen contacten ziet en wijzigt.
 */

interface ContactInput {
  name: string;
  phone: string;
  email: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const byName = (a: TrustedContact, b: TrustedContact) => a.name.localeCompare(b.name, "nl");

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const TrustedContactsCard = () => {
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /** The contact being edited, "new" while adding, or null when closed. */
  const [editing, setEditing] = useState<TrustedContact | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TrustedContact | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let active = true;

    listContacts()
      .then((rows) => active && setContacts(rows))
      .catch((error) => {
        console.error("[SafeBuddy] Contacten laden mislukt:", error);
        if (active) toast.error("Contacten konden niet worden geladen");
      })
      .finally(() => active && setIsLoading(false));

    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (input: ContactInput): Promise<boolean> => {
    try {
      if (editing === "new") {
        const contact = await addContact(input);
        setContacts((current) => [...current, contact].sort(byName));
        toast.success(`${contact.name} toegevoegd`);
      } else if (editing) {
        const contact = await updateContact(editing.id, input);
        setContacts((current) =>
          current.map((item) => (item.id === contact.id ? contact : item)).sort(byName)
        );
        toast.success(`${contact.name} bijgewerkt`);
      }
      setEditing(null);
      return true;
    } catch (error) {
      console.error("[SafeBuddy] Contact opslaan mislukt:", error);
      toast.error(
        error instanceof Error && error.message === "not-authenticated"
          ? "Log in om contacten te beheren"
          : "Kon het contact niet opslaan"
      );
      return false;
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await removeContact(pendingDelete.id);
      setContacts((current) => current.filter((c) => c.id !== pendingDelete.id));
      toast.success(`${pendingDelete.name} verwijderd`);
      setPendingDelete(null);
    } catch (error) {
      console.error("[SafeBuddy] Contact verwijderen mislukt:", error);
      toast.error("Kon het contact niet verwijderen");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="rounded-2xl border-0 shadow-card">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">Noodcontacten</h2>
          </div>
          {contacts.length > 0 && (
            <Button size="sm" onClick={() => setEditing("new")} className="rounded-full">
              <Plus className="h-4 w-4" />
              Toevoegen
            </Button>
          )}
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Kies deze mensen als je je rit deelt. Ze kunnen je live volgen en krijgen je laatste
          locatie als je niet op tijd incheckt.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          De SOS-knop belt het noodnummer; je contacten krijgen daarbij geen automatisch bericht.
        </p>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2" role="status" aria-label="Contacten laden">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
              <p className="font-medium">Nog geen noodcontacten</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Voeg iemand toe die je rit kan volgen en gewaarschuwd wordt als je niet op tijd
                incheckt.
              </p>
              <Button onClick={() => setEditing("new")} className="mt-4 rounded-full">
                <Plus className="h-4 w-4" />
                Noodcontact toevoegen
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {contacts.map((contact) => (
                <li
                  key={contact.id}
                  className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-tint font-semibold text-primary"
                  >
                    {contact.name[0]?.toUpperCase() ?? "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{contact.name}</p>
                    {contact.phone && (
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {contact.phone}
                      </p>
                    )}
                    {contact.email && (
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {contact.email}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(contact)}
                    aria-label={`${contact.name} bewerken`}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-primary-tint hover:text-primary",
                      focusRing
                    )}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(contact)}
                    aria-label={`${contact.name} verwijderen`}
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                      focusRing
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <ContactDialog
        open={editing !== null}
        contact={editing === "new" ? null : editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={handleSave}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDelete(null);
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{pendingDelete?.name} verwijderen?</DialogTitle>
            <DialogDescription>
              Deze persoon kun je daarna niet meer kiezen bij het delen van je rit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={isDeleting}
              className="rounded-xl"
            >
              Annuleren
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={isDeleting}
              className="rounded-xl"
            >
              {isDeleting ? "Verwijderen…" : "Verwijderen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

interface ContactDialogProps {
  open: boolean;
  /** The contact to edit, or null to add a new one. */
  contact: TrustedContact | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: ContactInput) => Promise<boolean>;
}

const ContactDialog = ({ open, contact, onOpenChange, onSave }: ContactDialogProps) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fill the fields each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(contact?.name ?? "");
    setPhone(contact?.phone ?? "");
    setEmail(contact?.email ?? "");
    setError(null);
  }, [open, contact]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!name.trim()) {
      setError("Vul een naam in.");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setError("Vul een telefoonnummer of e-mailadres in, zodat deze persoon bereikbaar is.");
      return;
    }
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) {
      setError("Dit e-mailadres lijkt niet te kloppen.");
      return;
    }

    setError(null);
    setIsSaving(true);
    await onSave({ name, phone, email });
    setIsSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{contact ? "Noodcontact bewerken" : "Noodcontact toevoegen"}</DialogTitle>
          <DialogDescription>
            Vul minstens een telefoonnummer of e-mailadres in.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="contact-name">Naam</Label>
            <Input
              id="contact-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">Telefoon</Label>
            <Input
              id="contact-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              placeholder="06 12345678"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-email">E-mail</Label>
            <Input
              id="contact-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="naam@voorbeeld.nl"
              className="h-11 rounded-xl"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="rounded-xl"
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={isSaving} className="rounded-xl">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              Opslaan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TrustedContactsCard;
