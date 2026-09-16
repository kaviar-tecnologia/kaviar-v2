const KAVIAR_WHATSAPP = '5521968648777';

const sections = [
  {
    title: 'Origem',
    text: 'O KAVIAR nasceu da leitura prática dos desafios de mobilidade no Rio de Janeiro — lacunas de cobertura, informalidade e desconexão com o contexto local.',
  },
  {
    title: 'Modelo',
    text: 'A operação parte do território. Cada região tem regras, geofences e dinâmica próprias. Motoristas operam vinculados ao contexto local. Nada é genérico.',
  },
  {
    title: 'Expansão',
    text: 'Ativar uma nova região significa configurar operação e integrar motoristas locais — sem reconstruir o produto. Crescimento por adaptação, não por improviso.',
  },
  {
    title: 'Estágio atual',
    text: 'Operação ativa no Rio de Janeiro. App mobile, painel administrativo, corridas em tempo real, inteligência territorial. Plataforma desenvolvida pela KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA.',
  },
];

const ctas = [
  { label: 'Conversar sobre o projeto', msg: 'Olá, gostaria de conversar sobre o KAVIAR.' },
  { label: 'Receber material executivo', msg: 'Olá, gostaria de receber o material executivo do KAVIAR.' },
  { label: 'Agendar apresentação', msg: 'Olá, gostaria de agendar uma apresentação do KAVIAR.' },
];

export default function InvestorVision() {
  return (
    <div style={{
      maxWidth: 480,
      margin: '0 auto',
      padding: '80px 24px 100px',
      fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
      color: '#1a1a1a',
    }}>
      <header style={{ marginBottom: 64 }}>
        <p style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#bbb',
          margin: '0 0 20px 0',
        }}>
          Visão do Projeto
        </p>
        <h1 style={{
          fontSize: 26,
          fontWeight: 600,
          color: '#111',
          lineHeight: 1.4,
          margin: 0,
        }}>
          Operar onde modelos genéricos não conseguem ler o território.
        </h1>
      </header>

      {sections.map((s, i) => (
        <section key={i} style={{ marginBottom: 44 }}>
          <h2 style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#ccc',
            marginBottom: 8,
          }}>
            {s.title}
          </h2>
          <p style={{
            fontSize: 15,
            color: '#555',
            margin: 0,
            lineHeight: 1.7,
          }}>
            {s.text}
          </p>
        </section>
      ))}

      <div style={{ marginTop: 72, paddingTop: 44, borderTop: '1px solid #eee' }}>
        <p style={{ fontSize: 14, color: '#999', marginBottom: 24 }}>
          Se fizer sentido, teremos prazer em apresentar com mais profundidade.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ctas.map((c, i) => (
            <a
              key={i}
              href={`https://wa.me/${KAVIAR_WHATSAPP}?text=${encodeURIComponent(c.msg)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                padding: '12px 0',
                backgroundColor: 'transparent',
                color: i === 0 ? '#111' : '#999',
                border: 'none',
                borderBottom: '1px solid #eee',
                fontSize: 14,
                fontWeight: i === 0 ? 500 : 400,
                textDecoration: 'none',
                letterSpacing: '0.01em',
              }}
            >
              {c.label} →
            </a>
          ))}
        </div>
      </div>

      <footer style={{
        marginTop: 80,
        fontSize: 10,
        color: '#ddd',
        letterSpacing: '0.02em',
      }}>
        KAVIAR
      </footer>
    </div>
  );
}
