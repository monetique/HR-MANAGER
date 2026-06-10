let cachedLogo = null

export async function getLogoBase64() {
  if (cachedLogo) return cachedLogo
  try {
    const res = await fetch('/logo_smt.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width  = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        cachedLogo = canvas.toDataURL('image/png')
        resolve(cachedLogo)
      }
      img.onerror = () => resolve(null)
      img.src = URL.createObjectURL(blob)
    })
  } catch { }
  return null
}

export function addLogoToPDF(doc, logoBase64, headerHeight = 28) {
  if (!logoBase64) return
  try {
    const pageW = doc.internal.pageSize.getWidth()
    const logoW = 38
    const logoH = 16
    const logoX = pageW - logoW - 8
    const logoY = (headerHeight - logoH) / 2
    doc.addImage(logoBase64, 'PNG', logoX, logoY, logoW, logoH)
  } catch { }
}
