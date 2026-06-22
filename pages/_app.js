import "@/styles/globals.css";
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function App({ Component, pageProps }) {
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!(event.ctrlKey && event.shiftKey && event.code === "KeyA")) {
        return;
      }

      event.preventDefault();

      if (router.pathname === "/admin") {
        window.sessionStorage.removeItem("iripple-admin-unlocked");
        router.push("/");
        return;
      }

      window.sessionStorage.setItem("iripple-admin-unlocked", "true");
      router.push("/admin");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return <Component {...pageProps} />;
}
