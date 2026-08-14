import type { Metadata } from "next";
import { LeadGenDashboard } from "./leadgen-dashboard";

export const metadata: Metadata = {
  title: "LeadGen Command Center",
  description: "A focused workspace for finding, qualifying, and contacting decision makers.",
  openGraph: {
    title: "LeadGen Command Center",
    description: "Find the right person. Take the right action.",
    images: ["/leadgen-preview.png"],
  },
};

export default function Home() {
  return <LeadGenDashboard />;
}
