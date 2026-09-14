import { useEffect, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addContact, listContacts, removeContact, type TrustedContact } from "@/lib/trips";

/**
 * Beheer van vertrouwde contacten.
 *
 * Dit zijn de mensen die een rit mogen volgen en die bericht krijgen als een
 * check-in uitblijft.
 */
const TrustedContactsCard = () => {
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

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

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error("Vul een naam in");
      return;
    }

    setIsAdding(true);
    try {
      const contact = await addContact({ name, phone });
      setContacts((current) => [...current, contact].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setPhone("");
      toast.success(`${contact.name} toegevoegd`);
    } catch (error) {
      console.error("[SafeBuddy] Contact toevoegen mislukt:", error);
      toast.error("Kon het contact niet toevoegen");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (contact: TrustedContact) => {
    try {
      await removeContact(contact.id);
      setContacts((current) => current.filter((c) => c.id !== contact.id));
      toast.success(`${contact.name} verwijderd`);
    } catch (error) {
      console.error("[SafeBuddy] Contact verwijderen mislukt:", error);
      toast.error("Kon het contact niet verwijderen");
    }
  };

  return (
    <Card className="shadow-card mb-6">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Vertrouwde contacten</h3>
        </div>
        <p className="-mt-2 text-sm text-muted-foreground">
          Deze mensen kunnen je rit volgen als je die deelt.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Je hebt nog geen contacten toegevoegd.</p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((contact) => (
              <li
                key={contact.id}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{contact.name}</p>
                  {contact.phone && (
                    <p className="truncate text-xs text-muted-foreground">{contact.phone}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleRemove(contact)}
                  aria-label={`${contact.name} verwijderen`}
                  className="h-7 w-7 shrink-0 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 border-t border-muted pt-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Naam"
            className="min-w-[8rem] flex-1"
          />
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Telefoon (optioneel)"
            type="tel"
            className="min-w-[8rem] flex-1"
          />
          <Button onClick={() => void handleAdd()} disabled={isAdding} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" />
            Toevoegen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TrustedContactsCard;
