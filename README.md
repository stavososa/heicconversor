# Conversor HEIC → JPEG

Aplicação web para converter imagens **HEIC/HEIF** (inclusive fotos de iPhone salvas com extensão `.jpg`), **PNG**, **WebP** e **JPEG** para **JPEG** diretamente no navegador, com processamento 100% local e download individual ou em lote (ZIP).

## Recursos

- **Privacidade total**: nenhuma imagem é enviada para servidores externos.
- **Detecção por magic bytes**: identifica o formato real do arquivo pelos primeiros bytes (resolve arquivos HEIC salvos como `.jpg`).
- **Controle de saída**: ajuste de qualidade JPEG, redimensionamento opcional (dimensão máxima), conversão automática e modo compacto opcional.
- **Processamento em lote**: fila com concorrência controlada, barra de progresso geral, visualização ampliada (preview) e download em `.zip`.
- **Tema claro e escuro**: alternância persistida no navegador.
- **Colar e arrastar**: suporte a drag-and-drop, seletor de arquivos e `Ctrl+V` da área de transferência.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS + Radix UI
- `heic-to` para decodificação HEIC/HEIF
- `jszip` para empacotamento em ZIP
- Vitest + Testing Library

## Scripts

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm run build      # build de produção
npm run typecheck  # verificação de tipos TypeScript
npm run lint       # análise estática ESLint
npm test           # testes unitários
```
