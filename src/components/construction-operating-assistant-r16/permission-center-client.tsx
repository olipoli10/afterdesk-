"use client";

import { useState } from "react";
import type { ConstructionPermissionCenter } from "@/lib/construction-operating-assistant-r16/permissions";

const STATE_LABEL = {
  INTERNAL: "Interne et actif",
  PREPARED_DISABLED: "Préparé, mais externe désactivé",
  GRANTED_LOCAL: "Accordé localement",
  REVOKED: "Révoqué",
} as const;

export function PermissionCenterClient({
  initial,
}: {
  initial: ConstructionPermissionCenter;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const revoke = async (input: {
    accountId: string;
    grantId?: string;
    expectedStateVersion: number;
  }) => {
    const targetId = input.grantId ?? input.accountId;
    if (pending) return;
    setPending(targetId);
    setMessage(null);
    try {
      const response = await fetch("/api/endvera/v1/mobile/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          action: input.grantId ? "REVOKE_GRANT_LOCAL" : "REVOKE_ACCOUNT_LOCAL",
          commandId: crypto.randomUUID(),
          workspaceId: snapshot.workspace.id,
          accountId: input.accountId,
          ...(input.grantId ? { grantId: input.grantId } : {}),
          expectedStateVersion: input.expectedStateVersion,
        }),
      });
      if (!response.ok) throw new Error("REFUSED");
      const refreshed = await fetch(
        `/api/endvera/v1/mobile/permissions?workspaceId=${encodeURIComponent(snapshot.workspace.id)}`,
        { headers: { Accept: "application/json" }, cache: "no-store" },
      );
      if (!refreshed.ok) throw new Error("REFRESH_REFUSED");
      setSnapshot(await refreshed.json() as ConstructionPermissionCenter);
      setMessage("Accès révoqué localement. Aucun fournisseur externe n’a été contacté.");
    } catch {
      setMessage("La révocation a été refusée ou l’état a changé. Recharge la page.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-6 text-[#F7F6F3]">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D6B878]">Permissions</p>
        <h1 className="mt-2 text-3xl font-semibold">Ce qu’ENDVERA peut faire</h1>
        <p className="mt-2 text-[#A1A8B3]">
          État canonique pour {snapshot.workspace.name}. Les transports externes demeurent désactivés.
        </p>
      </header>

      {message ? <p className="rounded-xl border border-[#5A4A33] bg-[#171513] p-4 text-sm">{message}</p> : null}

      <section className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5">
        <h2 className="text-xl font-semibold">Ton accès effectif</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {snapshot.capabilities.map((capability) => (
            <div key={capability.key} className="rounded-xl border border-[#2E3035] p-4">
              <p className="font-medium">{capability.label}</p>
              <p className="mt-1 text-sm text-[#A1A8B3]">{STATE_LABEL[capability.state]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5">
        <h2 className="text-xl font-semibold">Équipe</h2>
        <div className="mt-4 space-y-3">
          {snapshot.members.map((member) => (
            <div key={member.userId} className="flex flex-wrap justify-between gap-2 rounded-xl border border-[#2E3035] p-4">
              <span>{member.displayName}{member.isCurrentUser ? " (toi)" : ""}</span>
              <span className="font-mono text-xs text-[#D6B878]">{member.role}</span>
            </div>
          ))}
        </div>
      </section>

      {snapshot.currentUser.role !== "FIELD_WORKER" ? (
        <section className="rounded-2xl border border-[#2E3035] bg-[#151619] p-5">
          <h2 className="text-xl font-semibold">Connecteurs</h2>
          <p className="mt-2 text-sm text-[#A1A8B3]">Aucun bouton ici ne contacte Google, un opérateur téléphonique ou un autre fournisseur.</p>
          <div className="mt-4 space-y-4">
            {snapshot.connectors.length === 0 ? <p className="text-[#A1A8B3]">Aucun connecteur préparé.</p> : null}
            {snapshot.connectors.map((connector) => (
              <article key={connector.id} className="rounded-xl border border-[#2E3035] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{connector.label}</h3>
                    <p className="text-sm text-[#A1A8B3]">{STATE_LABEL[connector.state]}</p>
                  </div>
                  {connector.revocable ? (
                    <button
                      className="rounded-lg border border-[#8B5A35] px-3 py-2 text-sm text-[#F0C28F] disabled:opacity-40"
                      disabled={Boolean(pending)}
                      onClick={() => void revoke({ accountId: connector.id, expectedStateVersion: connector.stateVersion })}
                    >
                      {pending === connector.id ? "Révocation…" : "Révoquer tout l’accès local"}
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 space-y-2">
                  {connector.grants.map((grant) => (
                    <div key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#0E0F11] p-3">
                      <div>
                        <p className="font-mono text-sm">{grant.capability}</p>
                        <p className="text-xs text-[#A1A8B3]">{STATE_LABEL[grant.state]}</p>
                      </div>
                      {grant.revocable ? (
                        <button
                          className="rounded-lg border border-[#45484F] px-3 py-2 text-xs disabled:opacity-40"
                          disabled={Boolean(pending)}
                          onClick={() => void revoke({
                            accountId: connector.id,
                            grantId: grant.id,
                            expectedStateVersion: grant.stateVersion,
                          })}
                        >
                          {pending === grant.id ? "Révocation…" : "Révoquer cette permission"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
