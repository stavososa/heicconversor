import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { useTheme } from "@/hooks/use-theme";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const App = () => {
  const { theme } = useTheme();

  return (
    <>
      <Sonner theme={theme} richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </>
  );
};

export default App;
