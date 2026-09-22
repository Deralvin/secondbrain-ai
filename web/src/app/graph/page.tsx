import GraphCanvas from "./GraphCanvas";
import { getGraph } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function GraphPage() {
  const graph = getGraph();
  return (
    <main className="main">
      <div className="page-heading">
        <div className="eyebrow">
          Relations between projects, memories, tags & agents
        </div>
        <h1>Knowledge Graph</h1>
      </div>
      <GraphCanvas nodes={graph.nodes} links={graph.links} />
    </main>
  );
}
