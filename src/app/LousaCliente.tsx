"use client";
// A lousa depende de window/document/IndexedDB: só renderiza no cliente.
import dynamic from "next/dynamic";

const App = dynamic(() => import("@/lousa/App"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center" style={{ background: "var(--lousa-fundo)" }}>
      <div className="flex flex-col items-center gap-3 text-sm" style={{ color: "var(--ui-texto-2)" }}>
        <div className="relative h-16 w-16">
          <span className="postit-demo" style={{ background: "#fff176", left: 0, top: 0, width: 40, height: 40, transform: "rotate(-8deg)", animation: "flutuar 2s ease-in-out infinite" }} />
          <span className="postit-demo" style={{ background: "#90caf9", left: 22, top: 18, width: 40, height: 40, transform: "rotate(6deg)", animation: "flutuar 2s ease-in-out infinite 0.4s" }} />
        </div>
        Abrindo a lousa…
      </div>
    </div>
  ),
});

export function LousaCliente() {
  return <App />;
}
