/**
 * Programa de Corretores Parceiros — Iara Mendes
 * Recebe o aceite assinado da página, arquiva numa planilha e envia a via
 * assinada em PDF para o parceiro e para a consultoria.
 *
 * Passo a passo de publicação: veja o README.md desta pasta.
 */

const CONFIG = {
  // Para onde vai a cópia de arquivo de cada aceite.
  emailConsultoria: 'PREENCHA@exemplo.com.br',
  nomeConsultoria: 'Iara Mendes',

  // Deixe vazio para usar a planilha à qual este script está vinculado.
  // Se o script for avulso, cole aqui o ID da planilha (o trecho entre /d/ e /edit).
  idPlanilha: '',
  nomeAba: 'Aceites',

  // Só aceita envios vindos destas origens. Deixe a lista vazia para aceitar todas.
  origensPermitidas: []
};

const COLUNAS = [
  'Recebido em', 'ID da assinatura', 'Versão do termo', 'Aceito em', 'Fuso',
  'Nome', 'CPF', 'E-mail', 'WhatsApp',
  'Forma de recebimento', 'Dados de recebimento',
  'Hash SHA-256 do termo', 'Origem', 'Navegador'
];

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return resposta({ ok: false, erro: 'requisição sem corpo' });
    }
    const dados = JSON.parse(e.postData.contents);

    if (dados.tipo !== 'aceite-termo-corretor-parceiro') {
      return resposta({ ok: false, erro: 'tipo de registro desconhecido' });
    }
    if (CONFIG.origensPermitidas.length && dados.assinatura) {
      const origem = String(dados.assinatura.origem || '');
      const liberada = CONFIG.origensPermitidas.some(function (o) { return origem.indexOf(o) === 0; });
      if (!liberada) return resposta({ ok: false, erro: 'origem não autorizada' });
    }
    if (!dados.parceiro || !dados.parceiro.email) {
      return resposta({ ok: false, erro: 'aceite sem e-mail do parceiro' });
    }

    const aba = obterAba();

    // A página pode reenviar o mesmo aceite quando o navegador bloqueia a
    // leitura da resposta. O ID da assinatura impede e-mail duplicado.
    if (jaRegistrado(aba, dados.idAssinatura)) {
      return resposta({ ok: true, duplicado: true });
    }

    registrar(aba, dados);

    const pdf = gerarPDF(dados);
    enviarParaParceiro(dados, pdf);
    enviarParaConsultoria(dados, pdf);

    return resposta({ ok: true });
  } catch (err) {
    console.error(err);
    return resposta({ ok: false, erro: String(err) });
  }
}

function doGet() {
  return resposta({ ok: true, servico: 'aceite-termo-corretor-parceiro', status: 'no ar' });
}

function resposta(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* Planilha                                                            */
/* ------------------------------------------------------------------ */

function obterAba() {
  const planilha = CONFIG.idPlanilha
    ? SpreadsheetApp.openById(CONFIG.idPlanilha)
    : SpreadsheetApp.getActiveSpreadsheet();

  if (!planilha) {
    throw new Error('Nenhuma planilha encontrada. Vincule o script a uma planilha ou preencha CONFIG.idPlanilha.');
  }

  let aba = planilha.getSheetByName(CONFIG.nomeAba);
  if (!aba) {
    aba = planilha.insertSheet(CONFIG.nomeAba);
    aba.appendRow(COLUNAS);
    aba.getRange(1, 1, 1, COLUNAS.length).setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  return aba;
}

function jaRegistrado(aba, id) {
  if (!id) return false;
  const ultima = aba.getLastRow();
  if (ultima < 2) return false;
  const ids = aba.getRange(2, 2, ultima - 1, 1).getValues();
  return ids.some(function (linha) { return String(linha[0]) === String(id); });
}

function registrar(aba, dados) {
  const r = dados.recebimento || {};
  aba.appendRow([
    new Date(),
    dados.idAssinatura || '',
    dados.versaoTermo || '',
    (dados.assinatura && dados.assinatura.dataHoraLegivel) || '',
    (dados.assinatura && dados.assinatura.fusoHorario) || '',
    dados.parceiro.nome || '',
    dados.parceiro.cpf || '',
    dados.parceiro.email || '',
    dados.parceiro.whatsapp || '',
    r.forma || '',
    resumoRecebimento(r),
    (dados.assinatura && dados.assinatura.hashTermoSHA256) || '',
    (dados.assinatura && dados.assinatura.origem) || '',
    (dados.assinatura && dados.assinatura.navegador) || ''
  ]);
}

function resumoRecebimento(r) {
  if (!r || !r.forma) return '';
  if (r.forma === 'PIX') return 'chave ' + (r.tipoChave || '') + ': ' + (r.chave || '');
  return [r.banco, 'agência ' + r.agencia, 'conta ' + r.conta, r.tipoConta]
    .filter(String).join(' · ');
}

/* ------------------------------------------------------------------ */
/* Documento                                                           */
/* ------------------------------------------------------------------ */

function gerarPDF(dados) {
  const nome = 'termo-assinado-' + apelido(dados.parceiro.nome) + '.pdf';
  return Utilities.newBlob(comprovanteHTML(dados), 'text/html', 'comprovante.html')
    .getAs('application/pdf')
    .setName(nome);
}

function apelido(nome) {
  return String(nome || 'parceiro')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'parceiro';
}

function escapar(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function comprovanteHTML(dados) {
  const a = dados.assinatura || {};
  const linhas = [
    ['Parceiro', dados.parceiro.nome],
    ['CPF', dados.parceiro.cpf],
    ['E-mail', dados.parceiro.email],
    ['WhatsApp', dados.parceiro.whatsapp],
    ['Recebimento da comissão', resumoRecebimento(dados.recebimento)],
    ['Versão do termo', dados.versaoTermo],
    ['Data e hora do aceite', a.dataHoraLegivel + (a.fusoHorario ? ' (' + a.fusoHorario + ')' : '')],
    ['Registro técnico', a.dataHoraISO + ' · ' + dados.idAssinatura],
    ['Impressão digital do termo', a.hashTermoSHA256 ? 'SHA-256 ' + a.hashTermoSHA256 : 'não disponível']
  ].map(function (l) {
    return '<tr><th>' + escapar(l[0]) + '</th><td>' + escapar(l[1]) + '</td></tr>';
  }).join('');

  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><style>' +
    'body{font-family:Helvetica,Arial,sans-serif;color:#12241F;line-height:1.55;margin:0;padding:0}' +
    '.cabeca{background:#1E4038;color:#FAF7F2;padding:30px 34px}' +
    '.selo{font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#6FA394;margin-bottom:9px}' +
    'h1{font-family:Georgia,serif;font-size:23px;font-weight:600;margin:0;line-height:1.25}' +
    '.corpo{padding:30px 34px}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:26px}' +
    'th,td{text-align:left;vertical-align:top;padding:10px 0;border-bottom:1px solid rgba(30,64,56,.14);font-size:12px}' +
    'th{width:36%;font-weight:bold;color:#2F5D50;padding-right:16px}' +
    'td{color:#3a4a45;word-break:break-word}' +
    'h2{font-family:Georgia,serif;font-size:16px;color:#1E4038;margin:0 0 12px}' +
    'pre{white-space:pre-wrap;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#3a4a45;' +
    'background:#FAF7F2;border:1px solid rgba(30,64,56,.14);padding:18px;line-height:1.6;margin:0}' +
    '.rodape{padding:18px 34px 26px;font-size:10.5px;color:#7b8783}' +
    '</style></head><body>' +
    '<div class="cabeca"><div class="selo">Programa de corretores parceiros</div>' +
    '<h1>Termo de aceite assinado eletronicamente</h1></div>' +
    '<div class="corpo"><table>' + linhas + '</table>' +
    '<h2>Íntegra do termo aceito</h2><pre>' + escapar(dados.termoTexto) + '</pre></div>' +
    '<div class="rodape">Documento gerado automaticamente no momento do aceite. A impressão digital SHA-256 ' +
    'identifica exatamente a versão do texto aceita: qualquer alteração posterior no termo produz uma impressão diferente.</div>' +
    '</body></html>';
}

/* ------------------------------------------------------------------ */
/* E-mails                                                             */
/* ------------------------------------------------------------------ */

function moldura(titulo, miolo) {
  return '<div style="font-family:Helvetica,Arial,sans-serif;background:#FAF7F2;padding:30px 16px">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid rgba(30,64,56,.14);border-radius:16px;overflow:hidden">' +
    '<div style="background:#1E4038;color:#FAF7F2;padding:26px 30px">' +
    '<div style="font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:#6FA394;margin-bottom:8px">Programa de corretores parceiros</div>' +
    '<div style="font-family:Georgia,serif;font-size:21px;line-height:1.3">' + titulo + '</div></div>' +
    '<div style="padding:26px 30px;font-size:14px;color:#12241F;line-height:1.6">' + miolo + '</div>' +
    '<div style="padding:16px 30px 24px;border-top:1px solid rgba(30,64,56,.14);font-size:11.5px;color:#7b8783">' +
    'Mensagem automática do gerador de artes do Programa de Corretores Parceiros.</div>' +
    '</div></div>';
}

function enviarParaParceiro(dados, pdf) {
  const a = dados.assinatura || {};
  const miolo =
    '<p>Olá, ' + escapar(primeiroNome(dados.parceiro.nome)) + '.</p>' +
    '<p>Seu aceite ao <strong>Termo do Programa de Corretores Parceiros</strong> foi registrado. ' +
    'A via assinada está em anexo, em PDF — guarde com você.</p>' +
    '<p style="background:#FAF7F2;border:1px solid rgba(30,64,56,.14);border-radius:12px;padding:16px;font-size:13px">' +
    '<strong>Versão do termo:</strong> ' + escapar(dados.versaoTermo) + '<br>' +
    '<strong>Aceito em:</strong> ' + escapar(a.dataHoraLegivel) + '<br>' +
    '<strong>Recebimento da comissão:</strong> ' + escapar(resumoRecebimento(dados.recebimento)) +
    '</p>' +
    '<p>Qualquer dúvida sobre as regras de comissão ou de divulgação, é só responder este e-mail.</p>' +
    '<p>— ' + escapar(CONFIG.nomeConsultoria) + '</p>';

  MailApp.sendEmail({
    to: dados.parceiro.email,
    subject: 'Sua via do Termo de Corretores Parceiros',
    htmlBody: moldura('Seu termo assinado', miolo),
    attachments: [pdf],
    name: CONFIG.nomeConsultoria
  });
}

function enviarParaConsultoria(dados, pdf) {
  if (!CONFIG.emailConsultoria || CONFIG.emailConsultoria.indexOf('PREENCHA') === 0) return;

  const a = dados.assinatura || {};
  const miolo =
    '<p><strong>' + escapar(dados.parceiro.nome) + '</strong> aceitou o termo versão ' +
    escapar(dados.versaoTermo) + '.</p>' +
    '<p style="background:#FAF7F2;border:1px solid rgba(30,64,56,.14);border-radius:12px;padding:16px;font-size:13px">' +
    '<strong>CPF:</strong> ' + escapar(dados.parceiro.cpf) + '<br>' +
    '<strong>E-mail:</strong> ' + escapar(dados.parceiro.email) + '<br>' +
    '<strong>WhatsApp:</strong> ' + escapar(dados.parceiro.whatsapp) + '<br>' +
    '<strong>Recebimento:</strong> ' + escapar(resumoRecebimento(dados.recebimento)) + '<br>' +
    '<strong>Aceito em:</strong> ' + escapar(a.dataHoraLegivel) +
    (a.fusoHorario ? ' (' + escapar(a.fusoHorario) + ')' : '') +
    '</p>' +
    '<p style="font-size:12px;color:#7b8783">O registro completo foi gravado na planilha de aceites.</p>';

  MailApp.sendEmail({
    to: CONFIG.emailConsultoria,
    subject: 'Novo aceite — ' + dados.parceiro.nome,
    htmlBody: moldura('Novo parceiro assinou o termo', miolo),
    attachments: [pdf],
    name: 'Corretores Parceiros'
  });
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

/* ------------------------------------------------------------------ */
/* Teste manual — rode esta função depois de publicar                  */
/* ------------------------------------------------------------------ */

function testarEnvio() {
  const exemplo = {
    tipo: 'aceite-termo-corretor-parceiro',
    idAssinatura: 'teste-' + Date.now(),
    versaoTermo: '1',
    parceiro: {
      nome: 'Camila Ribeiro',
      email: Session.getActiveUser().getEmail(),
      whatsapp: '(21) 99999-9999',
      cpf: '000.000.000-00'
    },
    recebimento: { forma: 'PIX', tipoChave: 'cpf', chave: '000.000.000-00' },
    assinatura: {
      dataHoraISO: new Date().toISOString(),
      dataHoraLegivel: Utilities.formatDate(new Date(), 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm:ss"),
      fusoHorario: 'America/Sao_Paulo',
      hashTermoSHA256: 'teste',
      origem: 'teste-local',
      navegador: 'teste'
    },
    termoTexto: 'Texto do termo usado apenas para teste.'
  };

  const aba = obterAba();
  registrar(aba, exemplo);
  const pdf = gerarPDF(exemplo);
  enviarParaParceiro(exemplo, pdf);
  enviarParaConsultoria(exemplo, pdf);
  console.log('Teste concluído. Confira a planilha e a caixa de entrada.');
}
