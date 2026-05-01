## Corrigir erro "Não foi possível converter este arquivo"

**Causa raiz**: o iPhone frequentemente salva fotos HEIC com extensão `.jpg` (como nos seus arquivos `IMG_9665.jpg` etc.). O código atual decide o tipo apenas pela extensão/MIME e:
- Rejeita silenciosamente arquivos `.jpg` reais HEIC se o filtro de extensão for estrito; ou
- Manda para `heic2any` arquivos que já são JPEG verdadeiros, e a biblioteca falha.

Resultado: todos os arquivos aparecem com erro.

### Correção

1. **Detectar o formato real pelos magic bytes** do início do arquivo, não pela extensão:
   - HEIC/HEIF: assinatura `ftyp` + brand (`heic`, `heix`, `mif1`, `heif`, etc.) nos bytes 4–12.
   - JPEG: `FF D8 FF`.
   - PNG: `89 50 4E 47`.
   - WebP: `RIFF` + `WEBP`.

2. **Conversão inteligente em `src/lib/heic.ts`** (renomear export para `convertToJpeg`):
   - HEIC real → `heic2any` (mesmo que o nome seja `.jpg`).
   - JPEG real → passa adiante sem reconverter (preserva qualidade original).
   - PNG/WebP → reencoda para JPEG via `<canvas>` com fundo branco (evita transparência preta).
   - Outros → erro claro: "Formato não suportado".

3. **Aceitar mais entradas no dropzone** (`HeicConverter.tsx`):
   - Aceitar qualquer arquivo cujo `type` comece com `image/` ou cuja extensão seja `.heic/.heif/.jpg/.jpeg/.png/.webp`.
   - O filtro pesado de tipo passa a ser feito após ler os magic bytes.
   - Atualizar o `accept` do `<input>` e o texto da dropzone para refletir os formatos aceitos.

4. **Mensagens de erro mais úteis** vindas direto da função de conversão (ex.: "Formato não suportado", "Falha ao decodificar HEIC").

### Arquivos alterados

- `src/lib/heic.ts` — adicionar `detectKind`, substituir `convertHeicToJpeg` por `convertToJpeg`, remover `isHeicFile`, ajustar `renameToJpg` para mais extensões.
- `src/components/HeicConverter.tsx` — usar `convertToJpeg`, novo filtro de entrada, atualizar `accept` e copy do dropzone (ex.: "HEIC, JPG, PNG ou WebP").

### Fora do escopo

- Não vou alterar o limite de 50 MB nem a qualidade fixa de 95%.
- Sem mudança na UI/visual além do texto da dropzone.
