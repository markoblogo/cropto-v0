import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_INTEREST_OPTIONS } from "@/components/deck/deck-content";

type ContactFormState = {
  fullName: string;
  email: string;
  organization: string;
  interest: string;
  message: string;
};

const INITIAL_FORM_STATE: ContactFormState = {
  fullName: "",
  email: "",
  organization: "",
  interest: CONTACT_INTEREST_OPTIONS[0],
  message: "",
};

export function DeckContactForm() {
  const [formState, setFormState] = useState<ContactFormState>(INITIAL_FORM_STATE);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <Card className="border-primary/35 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-xl">Request received</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Thank you. Your message has been captured in this demo flow. A production contact endpoint can be connected
            when ready.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setFormState(INITIAL_FORM_STATE);
              setIsSubmitted(false);
            }}
          >
            Send another request
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Contact request</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              required
              value={formState.fullName}
              onChange={(event) => setFormState((current) => ({ ...current, fullName: event.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              required
              value={formState.email}
              onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="organization">Organization</Label>
            <Input
              id="organization"
              required
              value={formState.organization}
              onChange={(event) => setFormState((current) => ({ ...current, organization: event.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="interest">Interest</Label>
            <select
              id="interest"
              className="flex min-h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={formState.interest}
              onChange={(event) => setFormState((current) => ({ ...current, interest: event.target.value }))}
            >
              {CONTACT_INTEREST_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              rows={5}
              required
              value={formState.message}
              onChange={(event) => setFormState((current) => ({ ...current, message: event.target.value }))}
              placeholder="Share goals, timeline, and context for the conversation."
            />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit">Submit request</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
