import { LousaCliente } from "./LousaCliente";

export default function HomePage() {
  return (
    <main style={{ position: "fixed", inset: 0 }}>
      <div id="root-lousa" style={{ position: "absolute", inset: 0 }}>
        <LousaCliente />
      </div>
      {/* usado só na impressão em PDF */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img id="imagem-impressao" alt="Lousa para impressão" />
    </main>
  );
}
