import * as grpc from "@grpc/grpc-js"
import * as protoLoader from "@grpc/proto-loader"
import * as path from "path"

// Caminho para o .proto de cálculo
const PROTO_PATH = path.join(__dirname, "../protos/calculo.proto")

// Configuração de carregamento do protobuf
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
})
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any
const calculoProto = protoDescriptor.calculo

// Porta que o servidor de cálculo vai escutar
let PORT_SERVIDOR_CALCULO = 8060

// Função para tentar portas alternativas caso a primeira falhe
async function tentarBindarServidor(
  server: grpc.Server,
  portaInicial: number,
  tentativas: number = 3
): Promise<number> {
  for (let i = 0; i < tentativas; i++) {
    const portaAtual = portaInicial + i
    try {
      const port = await new Promise<number>((resolve, reject) => {
        server.bindAsync(
          `localhost:${portaAtual}`, // Usando localhost em vez de IP específico
          grpc.ServerCredentials.createInsecure(),
          (err, port) => {
            if (err) {
              reject(err)
            } else {
              resolve(port)
            }
          }
        )
      })
      return port
    } catch (err) {
      console.warn(`Não foi possível usar a porta ${portaAtual}: ${err}`)
      if (i === tentativas - 1) {
        throw new Error(
          `Não foi possível iniciar o servidor após ${tentativas} tentativas`
        )
      }
    }
  }
  throw new Error("Falha ao tentar portas alternativas")
}

// Funções utilitárias de estatística
function calcularMedia(nums: number[]): number {
  if (nums.length === 0) return 0
  const soma = nums.reduce((acc, val) => acc + val, 0)
  return parseFloat((soma / nums.length).toFixed(2))
}

function calcularMediana(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    // média dos dois valores centrais
    return parseFloat(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2))
  }
  return parseFloat(sorted[mid].toFixed(2))
}

// Implementação do serviço de cálculo
async function criarServidorCalculo() {
  const server = new grpc.Server()

  server.addService(calculoProto.CalculoService.service, {
    CalcularMetricas: (call: any, callback: grpc.sendUnaryData<any>) => {
      const dados: Array<any> = call.request.dados || []

      // Agrupa dados por bancada_id
      const agrupado: Record<
        string,
        { temperaturas: number[]; umidades: number[]; condutividades: number[] }
      > = {}
      dados.forEach((d: any) => {
        const id = d.bancada_id
        if (!agrupado[id]) {
          agrupado[id] = { temperaturas: [], umidades: [], condutividades: [] }
        }
        agrupado[id].temperaturas.push(d.temperatura)
        agrupado[id].umidades.push(d.umidade)
        agrupado[id].condutividades.push(d.condutividade)
      })

      // Calcula métricas para cada bancada
      const resultado = Object.entries(agrupado).map(([bancada_id, lists]) => ({
        bancada_id,
        media_temperatura: calcularMedia(lists.temperaturas),
        mediana_temperatura: calcularMediana(lists.temperaturas),
        media_umidade: calcularMedia(lists.umidades),
        mediana_umidade: calcularMediana(lists.umidades),
        media_condutividade: calcularMedia(lists.condutividades),
        mediana_condutividade: calcularMediana(lists.condutividades),
      }))

      // Retorna o resultado
      callback(null, { metricas: resultado })
    },
  })

  try {
    const porta = await tentarBindarServidor(server, PORT_SERVIDOR_CALCULO)
    server.start()
    PORT_SERVIDOR_CALCULO = porta // Atualiza a porta caso uma alternativa tenha sido usada
    console.log(`Servidor de cálculo rodando em grpc://localhost:${porta}`)
    return porta
  } catch (err) {
    console.error("Erro ao iniciar servidor de cálculo:", err)
    process.exit(1)
  }
}

// Inicia o servidor de cálculo
criarServidorCalculo()
