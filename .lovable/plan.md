## Conversor HEIC → JPEG (multi-upload)

Aplicação 100% no navegador (sem backend) para converter várias imagens HEIC/HEIF em JPEG de alta qualidade (95%), com preview, comparação de tamanho, drag & drop e download individual ou em ZIP.

### Tela única (`/`)

Layout limpo, centralizado, responsivo (mobile e desktop):

```text
┌──────────────────────────────────────────────┐
│  Conversor HEIC → JPEG                        │
│  Converta várias imagens de uma vez,          │
│  direto no seu navegador. Nada é enviado.     │
├──────────────────────────────────────────────┤
│   ┌────────────────────────────────────┐     │
│   │  ⬆  Arraste arquivos HEIC aqui      │     │
│   │     ou clique para selecionar       │     │
│   └────────────────────────────────────┘     │
│                                               │
│  [ Baixar tudo (ZIP) ]   [ Limpar lista ]    │
│                                               │
│  ┌─ Lista de arquivos ───────────────────┐   │
│  │ [thumb] foto1.heic                     │   │
│  │         2.4 MB → 1.1 MB  (-54%)  ✓     │   │
│  │                              [Baixar]  │   │
│  │ [thumb] foto2.heic  ⏳ convertendo…    │   │
│  │ [    ]  foto3.heic  ✗ erro: inválido   │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### Funcionalidades

1. **Upload múltiplo**
   - Botão "Selecionar arquivos" (input `accept=".heic,.heif,image/heic,image/heif"`, multiple).
   - **Drag & drop** na área pontilhada com estado visual ao arrastar por cima.
   - Arquivos não-HEIC são rejeitados com toast informativo.

2. **Conversão automática**
   - Cada arquivo é convertido assim que adicionado, em paralelo controlado (até 3 por vez para não travar a aba).
   - Qualidade JPEG fixa em 95%.
   - Estado por arquivo: `pendente` → `convertendo` (spinner) → `pronto` (✓) ou `erro` (✗ com mensagem).

3. **Preview e métricas**
   - Miniatura do JPEG resultante (gerada via `URL.createObjectURL`).
   - Mostra **tamanho original vs convertido** e variação percentual (verde se menor, cinza se maior).
   - Nome do arquivo preservado, extensão trocada para `.jpg`.

4. **Downloads**
   - Botão **"Baixar"** por linha → baixa o JPEG individual.
   - Botão **"Baixar tudo (ZIP)"** no topo → empacota todos os convertidos com sucesso em `imagens-convertidas.zip`. Desabilitado enquanto não houver nenhum pronto.
   - Botão **"Limpar lista"** remove todos os itens e libera a memória dos blobs.

5. **Feedback**
   - Toasts (sonner) para sucesso geral, erros de arquivo inválido e quando o ZIP fica pronto.
   - Aviso curto: "As imagens são processadas no seu dispositivo. Nada é enviado para servidores."

### Design

- Tema claro, minimalista, baseado nos tokens já existentes em `index.css` (sem cores hardcoded).
- Componentes shadcn já no projeto: `Button`, `Card`, `Progress` (ou spinner simples), `Toast`/`Sonner`.
- Tipografia padrão; títulos com bom contraste; área de drop com `border-dashed` e destaque ao hover/drag-over.

### Detalhes técnicos

- **Bibliotecas a adicionar**:
  - `heic2any` — conversão HEIC → JPEG no navegador.
  - `jszip` — geração do arquivo ZIP.
- **Estrutura**:
  - `src/pages/Index.tsx` — substitui o placeholder pela página do conversor.
  - `src/components/HeicConverter.tsx` — componente principal (estado da fila, dropzone, lista).
  - `src/components/FileRow.tsx` — linha de cada arquivo (thumb, métricas, ações).
  - `src/lib/heic.ts` — helper `convertHeicToJpeg(file, quality)` que retorna `{ blob, url }`.
  - `src/lib/zip.ts` — helper `buildZip(items)` retornando um Blob.
- **Concorrência**: pequena fila com limite de 3 conversões simultâneas para evitar travar a UI em uploads grandes.
- **Memória**: revogar `URL.createObjectURL` ao remover itens / desmontar.
- **Limites**: avisar via toast se um arquivo passar de ~50 MB (o `heic2any` pode falhar). Sem upload server-side.
- **Acessibilidade**: input acessível, botões com `aria-label`, feedback de status legível por leitores de tela.

### Fora do escopo

- Conversão para outros formatos (PNG, WebP).
- Edição (recorte, rotação, redimensionamento).
- Histórico persistente entre sessões.
