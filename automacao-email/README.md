# Envio automático do termo assinado

A página `index.html` é um arquivo estático — ela não consegue enviar e-mail sozinha.
Quem faz isso é um **Google Apps Script** publicado como app da Web: a página envia o
aceite para uma URL, e o script arquiva numa planilha e dispara os e-mails.

```
página (navegador)  ──POST JSON──▶  Apps Script  ──▶  Planilha (arquivo do aceite)
                                          │
                                          ├──▶  e-mail para o parceiro (via em PDF)
                                          └──▶  e-mail para a Iara (cópia + PDF)
```

Custo zero. Usa a conta Google da própria Iara.

---

## Publicação, passo a passo

**1. Criar a planilha**

Crie uma planilha nova no Google Drive — ela guarda o histórico de aceites.
Nome sugerido: `Corretores Parceiros — Aceites`.

**2. Abrir o editor de script**

Na planilha: menu **Extensões › Apps Script**. Apague o conteúdo do arquivo que abrir.

**3. Colar o código**

Cole todo o conteúdo de [`Codigo.gs`](Codigo.gs). No topo do arquivo, preencha:

```js
const CONFIG = {
  emailConsultoria: 'email-da-iara@gmail.com',   // recebe a cópia de cada aceite
  nomeConsultoria: 'Iara Mendes',
  idPlanilha: '',                                 // vazio: usa esta planilha
  nomeAba: 'Aceites',
  origensPermitidas: []                           // veja "Segurança" abaixo
};
```

Salve (Ctrl+S).

**4. Testar antes de publicar**

No seletor de funções, escolha **`testarEnvio`** e clique em **Executar**.
Na primeira vez o Google pede autorização — aceite (o aviso de "app não verificado"
é esperado: o app é da própria Iara; clique em *Avançado › Acessar o projeto*).

Confira: apareceu uma linha na aba `Aceites` e chegou um e-mail com o PDF anexado.

**5. Publicar como app da Web**

Botão **Implantar › Nova implantação**:

| Campo | Valor |
|---|---|
| Tipo | **App da Web** |
| Descrição | `Aceite do termo` |
| Executar como | **Eu** (a conta da Iara) |
| Quem pode acessar | **Qualquer pessoa** |

Clique em **Implantar** e **copie a URL** gerada — algo como
`https://script.google.com/macros/s/AKfy.../exec`.

> "Qualquer pessoa" é obrigatório: quem envia é o navegador do parceiro, que não
> está logado na conta da Iara. O script continua rodando com as permissões dela.

**6. Ligar a página ao script**

Em `index.html`, procure `var ENVIO_TERMO` e preencha:

```js
var ENVIO_TERMO = {
  endpoint: "https://script.google.com/macros/s/AKfy.../exec",
  emailConsultoria: "email-da-iara@gmail.com",
  nomeConsultoria: "Iara Mendes"
};
```

Publique a página e faça um aceite de teste de ponta a ponta.

---

## A cada alteração no script

Editar o código **não** atualiza o app publicado. É preciso
**Implantar › Gerenciar implantações › ✏️ › Versão: Nova versão › Implantar**.
A URL continua a mesma.

---

## Segurança

O endpoint fica visível no HTML da página — qualquer pessoa pode enviar dados para ele.
Duas proteções recomendadas:

- **Restringir a origem.** Depois de publicar a página, preencha:
  ```js
  origensPermitidas: ['https://vivaletravel.github.io/corretorparceiro-iaramendes/']
  ```
  O script passa a recusar envios que não venham dali. Não é infalível (o campo é
  enviado pelo navegador), mas barra disparo automatizado casual.
- **Vigiar a cota.** Conta Gmail comum envia **100 e-mails/dia**; Google Workspace, 1.500.
  Cada aceite consome 2 (parceiro + Iara).

---

## Duplicidade

O navegador nem sempre consegue ler a resposta do Apps Script por causa de CORS.
Quando isso acontece, a página reenvia o aceite em modo cego — o mesmo registro pode
chegar duas vezes. Por isso cada assinatura carrega um `idAssinatura` único, e o
script ignora um ID que já esteja na planilha. Nenhum parceiro recebe e-mail repetido.

---

## O que a página envia

```json
{
  "tipo": "aceite-termo-corretor-parceiro",
  "idAssinatura": "uuid",
  "versaoTermo": "1",
  "parceiro":    { "nome": "", "email": "", "whatsapp": "", "cpf": "" },
  "recebimento": { "forma": "PIX", "tipoChave": "cpf", "chave": "" },
  "assinatura":  {
    "dataHoraISO": "", "dataHoraLegivel": "", "fusoHorario": "",
    "hashTermoSHA256": "", "origem": "", "navegador": ""
  },
  "termoTexto": "íntegra do termo aceito"
}
```

Quando a forma de recebimento é transferência, `recebimento` vem como
`{ "forma": "Transferência bancária", "banco": "", "agencia": "", "conta": "", "tipoConta": "" }`.

O `hashTermoSHA256` é a impressão digital do texto aceito. Se o termo for alterado
depois, o hash muda — é o que permite provar qual versão cada parceiro assinou.

---

## Proteção de dados

A planilha passa a conter CPF e dados bancários dos parceiros. Vale:

- Não compartilhar a planilha com mais ninguém além de quem precisa pagar as comissões
- Manter a conta Google com verificação em duas etapas
- Atender pedidos de exclusão, previstos na cláusula 6 do termo
