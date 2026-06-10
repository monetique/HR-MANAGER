# Scripts Import Congés SMT_V9SQL → HR Manager

## Ordre d'exécution

### 1. Import des soldes
[200~- Source : /tmp/recap3.csv (TWF_COMPTEURS - soldes par employé)
- Requête SSMS : SELECT MatriculeSalarie, Nom, Prenom, CodeNature, Intitule, SoldeN_cloture, SoldeNP1_cloture, CongesN_valides, CongesN_EnCours, DateCloture FROM TWF_COMPTEURS JOIN T_SAL JOIN T_GHR WHERE SoldeN>0 OR SoldeNP1>0

### 2. Import des congés annuels (période 01/06/N-1 → aujourd'hui)
- Source : /tmp/recap5.csv (TWF_CONGE depuis 01/06/N-1)
- Codes : 0454, 0455, 0520, 0560, 0570, 0580, 0690

### 3. Import des congés maladie et autres
- Source : /tmp/recap8.csv (TWF_CONGE - 0550 depuis 01/01/N)
- Codes : 0550, 0560, 0570, 0690

## Mapping matricules SMT → HR Manager
- SMT utilise 2 chiffres (ex: 68) → HR Manager 3 chiffres (ex: 068)
- Exception : matricules > 100 restent identiques

## Logique soldes congé annuel
- 0454 SoldeNP1 = solde annuel à venir (versé le 01/06)
- 0460 SoldeN = report historique N-1
- annual_taken = congés pris du 01/06/N-1 au 31/05/N

## Notes
- Versement annuel : 01 juin de chaque année
- Retraités exclus du mapping (11, 12, 23, 25, 03, 04...)
- Relancer après chaque mise à jour de SMT_V9SQL
