import type { Metadata } from "next";
import {
  Badge,
  Button,
  EmptyState,
  OutcomeButton,
  ProbabilityBar,
  SectionHeader,
  Surface,
} from "@/components/ui";
import styles from "./ui-kit.module.css";

export const metadata: Metadata = {
  title: "UI kit — TRADEWAR",
  description: "The shared visual language and interface primitives for TRADEWAR.",
};

const colors = [
  ["Page", "var(--color-page)"],
  ["Surface", "var(--color-surface)"],
  ["Raised", "var(--color-surface-raised)"],
  ["Border", "var(--color-border)"],
  ["Text", "var(--color-text)"],
  ["Muted", "var(--color-text-muted)"],
  ["Accent", "var(--color-accent)"],
  ["Probability", "var(--color-probability)"],
  ["Yes", "var(--color-yes)"],
  ["No", "var(--color-no)"],
] as const;

export default function UIKitPage() {
  return (
    <div className={styles.page}>
      <SectionHeader
        as="h1"
        kicker="TRADEWAR system"
        title="Interface kit"
        description="A compact set of surfaces, controls, and market states. Components share one flat graphite palette, one spacing scale, and consistent interaction states."
        actions={
          <Button href="/" variant="secondary">
            Back to markets
          </Button>
        }
      />

      <section className={styles.section} aria-labelledby="color-title">
        <SectionHeader
          id="color-title"
          title="Color roles"
          description="Semantic roles keep the exchange legible without decorative gradients or glow effects."
        />
        <div className={styles.swatches}>
          {colors.map(([label, color]) => (
            <Surface level={1} className={styles.swatch} key={label}>
              <span className={styles.swatchColor} style={{ background: color }} />
              <span>{label}</span>
              <code>{color.replace("var(", "").replace(")", "")}</code>
            </Surface>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="type-title">
        <SectionHeader
          id="type-title"
          title="Type hierarchy"
          description="Editorial questions, practical interface copy, and tabular market data each have a clear job."
        />
        <Surface level={1} className={styles.typeSpecimen}>
          <div>
            <span className={styles.label}>Display</span>
            <p className={styles.display}>Will the next tariff package pass?</p>
          </div>
          <div>
            <span className={styles.label}>Interface</span>
            <p className={styles.interface}>Explore the live market board</p>
          </div>
          <div>
            <span className={styles.label}>Market data</span>
            <p className={styles.data}>YES 64¢ · $2.4m volume · +3.2 pts</p>
          </div>
        </Surface>
      </section>

      <section className={styles.section} aria-labelledby="controls-title">
        <SectionHeader id="controls-title" title="Controls and states" />
        <div className={styles.componentGrid}>
          <Surface level={1} className={styles.specimen}>
            <span className={styles.label}>Buttons</span>
            <div className={styles.row}>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
            </div>
          </Surface>

          <Surface level={1} className={styles.specimen}>
            <span className={styles.label}>Badges</span>
            <div className={styles.row}>
              <Badge>Neutral</Badge>
              <Badge tone="accent">Macro</Badge>
              <Badge tone="live">Live</Badge>
              <Badge tone="resolved">Resolved</Badge>
            </div>
          </Surface>

          <Surface level={1} className={styles.specimen}>
            <span className={styles.label}>Outcomes</span>
            <div className={styles.outcomes}>
              <OutcomeButton outcome="yes" label="Buy Yes" price="64¢" />
              <OutcomeButton outcome="no" label="Buy No" price="36¢" />
            </div>
          </Surface>

          <Surface level={1} className={styles.specimen}>
            <span className={styles.label}>Probability</span>
            <div className={styles.probabilities}>
              <ProbabilityBar value={0.64} label="64% probability" />
              <ProbabilityBar value={0.33} label="33% probability" />
              <ProbabilityBar value={0.08} label="8% probability" />
            </div>
          </Surface>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="empty-title">
        <SectionHeader
          id="empty-title"
          title="Empty state"
          description="Empty states explain what happened and always offer a useful next move."
        />
        <EmptyState
          compact
          title="No matching markets"
          description="Try a broader topic or return to the full market board."
          action={
            <Button href="/" size="sm" variant="secondary">
              View all markets
            </Button>
          }
        />
      </section>
    </div>
  );
}
