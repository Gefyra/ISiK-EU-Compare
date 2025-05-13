# 🌐 ISiK EU Profile Comparison Tool

👉 **[View the Results on GitHub Pages](https://gefyra.github.io/ISiK-EU-Compare)**

---

## 🧾 Project Purpose

This project provides an automated framework to **compare FHIR profiles** from the German ISiK initiative with corresponding profiles from various **HL7 Europe Implementation Guides (IGs)**. The results are published as a navigable website using **GitHub Pages**.

The goal is to help implementers and standard developers understand structural and semantic differences, align implementations, and support harmonization.

## ⚙️ How It Works

The repository defines three GitHub Actions workflows that automate the comparison and deployment:

### 1. `ig-preparing.yml` – 📥 IG Download and Extraction

- Reads IG package metadata from [`ComparisonConfig.yml`](.github/config/ComparisonConfig.yml)
- Downloads and extracts the specified FHIR packages
- Caches them under `PackagesForCache/`

### 2. `main.yml` – 🔬 Compare & 🚀 Publish Profiles

- Sets up Java, Node, and yq
- Installs the FHIR validator CLI
- Loads IGs into local  FHIR cache
- For each profile pair in the config:
  - Runs structural comparison
  - Saves HTML results in `Comparison/<profile-name>`
- Creates a central index with links to all comparisons
- Pushes the output to GitHub Pages

### 3. `deploy.yml` – Manual Redeploy

- Allows manual redeployment of the `Comparison/` folder contents to GitHub Pages

## 🗂 Configuration

The file [`ComparisonConfig.yml`](.github/config/ComparisonConfig.yml) defines:

- IGs to download:
  ```yaml
  igs:
    - name: hl7.fhir.eu.hdr.r4
      url: https://hl7.eu/fhir/build/hdr/package.r4.tgz
  ```

- Profile pairs to compare:
  ```yaml
  profiles:
    - dest: Comparison/EPS-Patient
      leftIg: de.gematik.isik@5.0.0-rc
      rightIg: hl7.fhir.eu.eps.r4@0.0.1-ci
      leftProfile: https://gematik.de/fhir/isik/StructureDefinition/ISiKPatient
      rightProfile: http://hl7.eu/fhir/eps/StructureDefinition/patient-eu-eps
  ```

Each comparison creates a separate folder with an `index.html` view of the results.

## 🛠 Requirements for Local Execution

To run or debug locally:

- Node.js v18
- Java 21
- yq and jq
- FHIR Validator CLI (e.g. `org.hl7.fhir.validation.cli-6.4.0.jar`)

## 📄 License

This project is licensed under the Apache 2.0 License. See the `LICENSE` file for details.