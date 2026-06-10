import React from 'react'
import { TrendingUp, AlertTriangle, CheckCircle, Info } from 'lucide-react'

function getAnalysis(kpis, scheduleStats, regime) {
  const alerts = []
  const recommendations = []

  if (!kpis) return { alerts, recommendations }

  const total = (parseInt(kpis.present)||0) + (parseInt(kpis.late)||0) +
                (parseInt(kpis.absent)||0) + (parseInt(kpis.on_leave)||0)

  if (total === 0) return { alerts, recommendations }

  // Déterminer le régime
  const regimeCode = regime?.code || '40h'
  const is48h = regimeCode === '48h'
  const isCustom = regimeCode === 'custom'

  // Taux absentéisme
  const absentRate = Math.round((parseInt(kpis.absent)||0) / total * 100)
  if (absentRate > 10) {
    alerts.push({ level: 'danger', text: `Taux d absentéisme élevé : ${absentRate}% (${kpis.absent} jours)` })
    recommendations.push('Entretien individuel recommandé pour comprendre les causes d absence')
  } else if (absentRate > 5) {
    alerts.push({ level: 'warning', text: `Absentéisme modéré : ${absentRate}% (${kpis.absent} jours)` })
    recommendations.push('Suivre l evolution de l absentéisme sur les prochaines semaines')
  }

  // Taux retards
  const lateRate = Math.round((parseInt(kpis.late)||0) / total * 100)
  if (lateRate > 15) {
    alerts.push({ level: 'danger', text: `Ponctualité insuffisante : ${lateRate}% de retards (${kpis.late} jours)` })
    recommendations.push('Rappel des horaires de travail et suivi de la ponctualité')
  } else if (lateRate > 8) {
    alerts.push({ level: 'warning', text: `Retards fréquents : ${lateRate}% (${kpis.late} jours)` })
  }

  // Télétravail
  const ttRate = Math.round((parseInt(kpis.teletravail)||0) / total * 100)
  if (ttRate > 30) {
    alerts.push({ level: 'info', text: `Télétravail important : ${ttRate}% (${kpis.teletravail} jours)` })
    recommendations.push('Évaluer l impact du télétravail sur la productivité et la collaboration')
  }

  // Analyse par horaire selon le régime
  if (scheduleStats && scheduleStats.length > 0) {
    scheduleStats.forEach(s => {
      if (!s.moy_duree) return
      const duree = parseFloat(s.moy_duree)
      const horaireName = (s.horaire || '').toLowerCase()

      // Base de calcul selon régime
      let requis = 8
      if (is48h) {
        requis = 9.6 // 48h / 5 jours
        alerts.push({ level: 'info', text: `Régime 48h — vérification mensuelle : ${parseFloat(regime?.hours_per_week||48) * 4}h/mois requis` })
      } else if (isCustom) {
        requis = 8 // 06-14h
      } else {
        // Régime 40h — selon horaire saisonnier
        if (horaireName.includes('ramad')) requis = 6
        else if (horaireName.includes('ete') || horaireName.includes('été') || horaireName.includes('summer')) requis = 6
        else requis = 8
      }

      if (!is48h) {
        const diff = duree - requis
        if (diff < -1) {
          alerts.push({ level: 'danger', text: `${s.horaire} : durée moyenne ${duree}h/j insuffisante (requis ${requis}h/j)` })
          recommendations.push(`Vérifier les pointages en période ${s.horaire}`)
        } else if (diff < -0.3) {
          alerts.push({ level: 'warning', text: `${s.horaire} : durée moyenne ${duree}h/j légèrement sous la norme (${requis}h/j)` })
        } else {
          alerts.push({ level: 'success', text: `${s.horaire} : durée moyenne ${duree}h/j conforme (norme ${requis}h/j)` })
        }
      }
    })
  }

  // Recommandations positives
  if (alerts.filter(a => a.level === 'danger').length === 0 &&
      alerts.filter(a => a.level === 'warning').length === 0) {
    recommendations.push('Bonne performance globale — continuer sur cette lancée')
  }

  return { alerts, recommendations }
}

const ALERT_STYLES = {
  danger:  { bg: 'bg-red-500/10 border-red-500/30',       text: 'text-red-400',    Icon: AlertTriangle },
  warning: { bg: 'bg-yellow-500/10 border-yellow-500/30', text: 'text-yellow-400', Icon: AlertTriangle },
  success: { bg: 'bg-green-500/10 border-green-500/30',   text: 'text-green-400',  Icon: CheckCircle   },
  info:    { bg: 'bg-blue-500/10 border-blue-500/30',     text: 'text-blue-400',   Icon: Info          },
}

export default function AttendanceAnalysis({ kpis, scheduleStats, regime }) {
  const { alerts, recommendations } = getAnalysis(kpis, scheduleStats, regime)

  if (!alerts.length && !recommendations.length) return null

  return (
    <div className="card space-y-4">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <TrendingUp size={16} className="text-blue-400" />
        Analyse & Recommandations
        {regime && <span className="text-xs text-gray-400 font-normal">— {regime.name}</span>}
      </h3>

      <div className="space-y-2">
        {alerts.map((alert, i) => {
          const style = ALERT_STYLES[alert.level]
          const Icon = style.Icon
          return (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${style.bg}`}>
              <Icon size={16} className={`${style.text} mt-0.5 shrink-0`} />
              <p className={`text-sm ${style.text}`}>{alert.text}</p>
            </div>
          )
        })}
      </div>

      {recommendations.length > 0 && (
        <div className="border-t border-gray-800 pt-3">
          <p className="text-xs font-medium text-gray-400 mb-2">Recommandations :</p>
          <ul className="space-y-1">
            {recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                <span className="text-blue-400 mt-0.5">→</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
