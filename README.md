# 3D Sprue Generator 🏭

Application web client-side autonome pour transformer n'importe quel fichier STL individuel en une **grappe d'impression 3D (sprue)** industrielle prête à la fabrication (MJF, SLS, résine) et exporter directement le **STL unique fusionné**.

---

## ⚡ Caractéristiques

- **100% Client-Side** : aucune installation, aucun serveur backend requis. Tout tourne directement dans le navigateur.
- **Import STL & Bounding Box** : Drag & Drop ou sélection de fichier, calcul automatique des dimensions $X \times Y \times Z$ en mm.
- **Sélection interactive du point d'attache (Gate Picking)** :
  - Clic direct sur la surface du modèle 3D via `THREE.Raycaster`.
  - Récupération du point $P(x,y,z)$ et de la normale $\vec{n}(n_x,n_y,n_z)$.
  - Marqueur visuel avec sphère d'impact et vecteur fléché normal orienté.
  - Détection automatique alternative du point latéral en un clic.
- **Agencement paramétrable** :
  - Quantité totale (2 à 50 pièces).
  - Disposition : **Double rangée** (2 rangées en vis-à-vis) ou **Simple rangée** (1 ligne).
  - Symétrie pour la 2ème rangée : **Rotation 180°** (préserve la chiralité sans inverser les pièces) ou **Miroir**.
  - Orientation du rail : **Auto** (perpendiculaire à la normale), **Axe X** ou **Axe Y**.
  - Éloignement du rail (*gate length*), diamètre sécable de l'attache (*gate Ø*), diamètre du canal principal (*runner Ø*).
  - Espacement longitudinal calculé automatiquement selon la taille du STL avec marge ajustable.
- **Prévisualisation 3D en temps réel** : visualisation de la grappe complète assemblée (N pièces + canal central + toutes les tiges).
- **Double Export** :
  - 🚀 **Export STL direct** : fusion des maillages via `BufferGeometryUtils.mergeGeometries()` et téléchargement en **STL binaire** compact.
  - 📄 **Export OpenSCAD (`.scad`)** : script OpenSCAD paramétrable avec `import()` et boucles `for`.

---

## 🚀 Utilisation

### Option 1 : Directement dans le navigateur
Ouvrez simplement le fichier `index.html` dans n'importe quel navigateur moderne (Chrome, Firefox, Edge, Brave, Safari) :
```bash
xdg-open index.html
```

### Option 2 : Serveur local HTTP (recommandé pour ESM)
```bash
python3 -m http.server 8080
```
Puis accédez à `http://localhost:8080` dans votre navigateur.

---

## 🛠️ Stack technique
- **Three.js** r160 (via ESM unpkg)
- **STLLoader** & **STLExporter**
- **BufferGeometryUtils**
- **Tailwind CSS** (Dark Mode moderne)
