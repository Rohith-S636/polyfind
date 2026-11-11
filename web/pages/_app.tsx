import React from "react";
import type { AppProps } from "next/app";
import Head from "next/head";
import "../styles/globals.css";

export default function PolyFindApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0f172a" />
        <title>PolyFind — Freshness-Constrained Adaptive Retrieval</title>
        <meta
          name="description"
          content="Freshness-constrained adaptive multi-store retrieval across MySQL, Redis, Neo4j, and vector embeddings."
        />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
