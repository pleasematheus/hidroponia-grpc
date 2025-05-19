import * as grpc from "@grpc/grpc-js"
import * as protoLoader from "@grpc/proto-loader"
import * as path from "path"

// Caminho para o .proto da bancada
const PROTO_PATH = path.join(__dirname, "../protos/bancada.proto")

// Carrega a definição do protobuf
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
})

// Cria o descritor do pacote
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any
const bancadaProto = protoDescriptor.bancada

// Função que inicializa uma instância do servidor de bancada
function iniciarBancada(id: string, porta: number) {
  const server = new grpc.Server()
  const bancadaId = id

  // Implementação do método EnviarDados gerando dados aleatórios
  server.addService(bancadaProto.BancadaService.service, {
    EnviarDados: (call: any, callback: grpc.sendUnaryData<any>) => {
      console.log(`Recebida solicitação de dados para a bancada ${bancadaId}`)

      const dados = {
        bancada_id: bancadaId,
        temperatura: parseFloat((Math.random() * 30 + 10).toFixed(2)), // 10°C a 40°C
        umidade: parseFloat((Math.random() * 100).toFixed(2)), // 0% a 100%
        condutividade: parseFloat((Math.random() * 500).toFixed(2)), // 0 a 500
        timestamp: new Date().toISOString(),
      }

      console.log(`Enviando dados da bancada ${bancadaId}:`, dados)
      callback(null, dados)
    },
  })

  // Tenta iniciar o servidor na porta especificada
  server.bindAsync(
    `0.0.0.0:${porta}`,
    grpc.ServerCredentials.createInsecure(),
    (err, boundPort) => {
      if (err) {
        console.error(`Erro ao iniciar bancada ${bancadaId} na porta ${porta}:`, err)
        
        // Se a porta estiver em uso, tenta uma porta alternativa
        if (err.message && err.message.includes('already in use')) {
          const novaporta = porta + 10;
          console.log(`Porta ${porta} está em uso. Tentando porta alternativa ${novaporta}...`);
          iniciarBancada(id, novaporta);
        }
        return;
      }
      server.start()
      console.log(
        `Bancada ${bancadaId} rodando em grpc://localhost:${boundPort}`
      )
    }
  )
}

// Função principal para iniciar bancadas
function main() {
  // Verifica se temos argumentos da linha de comando
  const args = process.argv.slice(2)
  
  if (args.length >= 2) {
    // Formato esperado: node bancada-simples.js <id> <porta>
    const id = args[0]
    const porta = parseInt(args[1], 10)
    
    if (isNaN(porta)) {
      console.error("Porta deve ser um número!")
      process.exit(1)
    }
    
    iniciarBancada(id, porta)
  } else {
    // Inicia uma bancada padrão na porta 50051
    iniciarBancada("bancada-teste", 50051)
    console.log("Você pode especificar ID e porta: node bancada-simples.js <id> <porta>")
  }
}

// Inicia o programa
main()
