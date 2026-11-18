# ECD PDF · Central de documentos

Central para **ordens de serviço e outros documentos em PDF**. Você importa dezenas de arquivos de uma vez e o sistema lê cada um: encontra o número da OS, o cliente, o tipo, a data, o equipamento e o técnico. Dá para buscar qualquer palavra de dentro dos PDFs, corrigir textos (um a um ou em lote) e enviar para o cliente assinar no [ECD Assina](https://github.com/Du-Edu-Duarte/ecd-assina).

**Demonstração:** https://du-edu-duarte.github.io/ecd-pdf/

> Versão de demonstração com ordens de serviço fictícias. Tudo fica salvo apenas no navegador de quem está usando.

## O que ele faz

1. **Importação em lote com leitura automática.** Arraste vários PDFs e ele preenche a lista sozinho: nº da OS, cliente, tipo (preventiva, corretiva, instalação…), data, equipamento e técnico.
2. **Busca dentro dos PDFs.** Procure por cliente, equipamento, peça ou qualquer palavra. O trecho encontrado aparece destacado. Há filtros por situação, tipo e mês.
3. **Situação de cada OS.** Pendente → Revisada → Enviada ao cliente / Em assinatura, com contadores no topo.
4. **Edição que preserva o original.** Duplo clique num texto do PDF para corrigir, ou escreva onde quiser (tamanho, cor e negrito). Correções mantêm o PDF nítido e pesquisável. Só a página em que você usa **Cobrir / apagar** vira imagem, para o conteúdo apagado sair de verdade.
5. **Correção em lote.** Troque um texto em vários documentos de uma vez, como o nome do técnico ou uma data. O sistema mostra antes quantas vezes o texto aparece em cada OS.
6. **Versões e histórico.** Salve versões, veja quem editou e quando, volte para qualquer versão ou restaure o original. Tem Ctrl+Z e Ctrl+Y.
7. **Ferramentas de páginas.** Reordene, gire, exclua, insira outro PDF, separe páginas em um novo documento, junte vários documentos em um e baixe uma versão leve.
8. **Envio para assinatura.** Um botão manda o PDF pronto para o ECD Assina, com o cliente e o técnico já como assinantes.
9. **Acesso só para clientes.** Cadastro com código de convite e login por código de e-mail. O login é o mesmo do ECD Assina (módulo `ecd-auth.js`).
10. **Funciona no celular.**

## Tecnologias

| | |
| --- | --- |
| Interface | HTML, CSS e JavaScript puro |
| PDF | [pdf.js](https://mozilla.github.io/pdf.js/) para ler, exibir e extrair texto, e [pdf-lib](https://pdf-lib.js.org/) para gerar o PDF final |
| Dados | IndexedDB (no navegador) |
| Hospedagem | GitHub Pages |

## Estrutura

```
index.html    # estrutura da página
style.css     # visual base ECD
pdf.css       # editor e lista
app.js        # importação, busca, editor, lote, versões e exportação
ecd-auth.js   # cadastro com convite e login (compartilhado com o ECD Assina)
vendor/       # pdf.js e pdf-lib
```

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Versão para empresas

Na versão para empresas, documentos, contas e convites ficam num servidor com login de verdade (por exemplo, Supabase). Assim a equipe inteira vê os mesmos documentos em qualquer computador ou celular, e o código de acesso chega no e-mail.

## Autor

**Eduardo Costa Duarte** · [ECD Tecnologia](https://www.instagram.com/ecdtecnologia/) · [LinkedIn](https://www.linkedin.com/in/eduardo-costa-0a0b462a8)
