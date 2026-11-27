import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.warn("Rota não encontrada:", location.pathname);
  }, [location.pathname]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Erro 404
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Página não encontrada
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço solicitado não existe ou foi movido.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao conversor
          </Link>
        </Button>
      </div>
    </main>
  );
};

export default NotFound;
