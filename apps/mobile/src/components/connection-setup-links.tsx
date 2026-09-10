import { router } from "expo-router";
import { Button, Card } from "@/components/ui";

/** Navigation only. Each destination reads its own current permissions/service state. */
export function ConnectionSetupLinks({ isWorkspaceOwner }: { isWorkspaceOwner: boolean }) {
  return <Card>
    <Button tone="secondary" onPress={() => router.push("/device-access")}>Gérer les accès de mon téléphone</Button>
    {isWorkspaceOwner ? <Button tone="secondary" onPress={() => router.push("/personal-service")}>Vérifier mon service texto ENDVERA</Button> : null}
  </Card>;
}
