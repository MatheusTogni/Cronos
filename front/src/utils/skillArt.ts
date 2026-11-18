/**
 * A carta de cada classe (1024×1536, em /classes) já traz a ilustração de cada
 * skill. Em vez de guardar uma imagem por skill, o app recorta essas
 * ilustrações da própria carta com CSS; a carta já está carregada, pois é o
 * retrato do personagem.
 *
 * Cada recorte é um quadrado `[centro x, centro y, lado]` em pixels da carta,
 * na ordem em que a classe libera as skills (1ª, 2ª, 3ª). Como a diagramação
 * varia de uma carta para outra, cada classe tem os seus. Se for criada uma
 * classe nova, é só acrescentar os 3 recortes; sem eles a skill aparece só
 * com o número, como antes.
 */
const CARD_W = 1024
const CARD_H = 1536

type Crop = readonly [cx: number, cy: number, size: number]

const SKILL_ART: Record<string, readonly [Crop, Crop, Crop]> = {
  apostador: [[235, 956, 106], [235, 1159, 106], [235, 1376, 106]],
  cacador: [[233, 973, 116], [233, 1140, 116], [233, 1356, 116]],
  carrasco: [[242, 1010, 108], [236, 1199, 108], [236, 1391, 108]],
  mascareiro: [[225, 944, 109], [225, 1159, 109], [225, 1373, 109]],
  mercador: [[236, 1021, 109], [236, 1212, 109], [236, 1412, 109]],
  necromante: [[230, 987, 112], [230, 1187, 112], [230, 1391, 112]],
  'raposa-vermelha': [[212, 997, 110], [212, 1187, 110], [212, 1381, 110]],
  'rasga-veus': [[227, 943, 108], [227, 1153, 108], [227, 1375, 108]],
  'tecelao-do-tempo': [[240, 965, 128], [240, 1171, 128], [240, 1379, 128]],
}

/**
 * Estilo que mostra só a ilustração da skill (`index` 0, 1 ou 2) dentro de um
 * elemento quadrado, ou null se a classe não tem recorte.
 */
export function skillArt(classId: string, artFile: string, index: number): Record<string, string> | null {
  const crop = SKILL_ART[classId]?.[index]
  if (!crop) return null
  const [cx, cy, size] = crop
  const x = Math.round(cx - size / 2)
  const y = Math.round(cy - size / 2)
  return {
    backgroundImage: `url("${artFile}")`,
    // a carta inteira numa largura tal que o lado do recorte preencha o quadrado
    backgroundSize: `${(CARD_W / size) * 100}% auto`,
    // posição em %: deslocamento = (quadrado − imagem) × p, daí p = canto / (carta − lado)
    backgroundPosition: `${(x / (CARD_W - size)) * 100}% ${(y / (CARD_H - size)) * 100}%`,
  }
}
