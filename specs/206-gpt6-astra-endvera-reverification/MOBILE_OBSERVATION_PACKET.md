# Paquet mobile — préparation locale seulement

Statut : `DEVICE_OBSERVATION_NOT_PERFORMED`. Ce document ne demande aucune session
à Olivier dans cette campagne. Il prépare la reprise technique ultérieure.

## Identité à vérifier avant une future observation autorisée

- Source : worktree `C:\dev\endvera-astra-reverification`; le commit produit exact
  sera indiqué dans le rapport final et le manifeste v3, sans substituer un ancien APK.
- Expo : `endveras-team/endvera`, projet `a7b2c087-f8e1-48e4-8798-f6fabefb69fe`.
- Android : package `ai.endvera.mobile`, version `0.1.1`, versionCode `3`.
- iOS : bundle `ai.endvera.mobile`, version `0.1.1`, buildNumber `1`.
- Profil Android déclaré : `founder-device`, distribution interne APK.
- Aucun APK reconstruit, signé, téléchargé ou installé dans cette campagne.
- SHA256 APK, EAS build ID correspondant à ce commit, appareil, version OS et
  signature : **non observés**. Ne pas remplir à partir d'un ancien build.

## Reproduction future, uniquement après autorisation distincte

1. Relier le SHA256 du binaire réellement installé au commit et à sa configuration
   de backend. Un export JavaScript ou une configuration correcte ne suffit pas.
2. Vérifier le package/version depuis `adb shell dumpsys package ai.endvera.mobile`
   sur l'appareil expressément autorisé. Ne pas collecter l'inventaire personnel.
3. Reproduire « J'ai un chantier » avec un compte et un chantier synthétiques,
   noter l'heure, la route, l'écran attendu et la sortie réelle.
4. Pour un crash reproductible, capturer seulement les journaux du processus
   ENDVERA à l'heure du crash; conserver stack, version, build et étapes minimales.
   Un `logcat` global peut contenir des données personnelles : ne pas le joindre.
5. Expurger tokens, contenu des contacts, calendrier, documents et données privées
   avant admission au dossier de preuves. La présente campagne n'autorise pas
   cette collecte et ne lance aucune commande ADB.
6. Vérifier séparément : lancement, login, navigation chantier, refus d'une
   permission, révocation ultérieure, retour après interruption et erreur réseau.

## Permissions et limites

La configuration déclare contacts, calendrier, microphone choisi, caméra/photos
choisies, localisation pendant l'utilisation, notifications et authentification
locale. Leur déclaration **ne prouve pas** leur fonctionnement ou leur octroi.
READ/WRITE_SMS et READ/WRITE_CALL_LOG sont bloquées : ENDVERA ne doit pas envoyer
depuis le numéro personnel. Le futur numéro ENDVERA et ses transports restent une
intégration distincte, non activée ici. Aucun calendrier Google/OAuth réel n'est testé.

Les résultats mobiles de cette campagne sont typecheck, lint, tests et export
locaux. Expo Doctor dépend encore de vérifications distantes non autorisées.
Ils ne constituent ni une certification store ni une preuve Samsung/iOS.
