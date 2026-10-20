import { useEffect } from "react";
import { useYtKey, YouTubeKeyForm } from "../YouTube";
import { Group, Section } from "./common";

export function YouTubeSection() {
  useEffect(() => {
    void useYtKey.getState().load();
  }, []);
  return (
    <Section
      title="YouTube"
      description="Vyro searches YouTube with your own YouTube Data API key. The key stays in Vyro's database on this computer and is only sent to YouTube."
    >
      <Group title="API key">
        <div className="px-4 py-4">
          <YouTubeKeyForm />
        </div>
      </Group>
    </Section>
  );
}
