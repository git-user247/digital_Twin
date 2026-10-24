# Step 6F — OCTDL Official Documentation Review

**Project:** AMD Digital Twin  
**Scope:** Documentation research on OCTDL labels, annotations, patient identifiers, and data-use terms  
**Review date:** 2026-10-24  
**Changes:** No code, labels, datasets, splits, model files, thresholds, or evaluation artifacts were changed; dataset files were not downloaded.

## Executive summary

The original OCTDL paper is Kulyabin et al., “OCTDL: Optical Coherence Tomography Dataset for Image-Based Deep Learning Methods,” published in *Scientific Data* 11, Article 365 (2024), DOI [10.1038/s41597-024-03182-7](https://doi.org/10.1038/s41597-024-03182-7). The paper is also available as arXiv:2312.08255, version 4, dated 2024-10-01. Its Mendeley Data record is version 4, DOI [10.17632/sncdhf53xc.4](https://doi.org/10.17632/sncdhf53xc.4).

The paper describes a dataset of labeled OCT B-scan images from seven disease groups, an image-level CSV label record, and a human annotation process involving medical students and retinal specialists. It defines drusen and MNV as the early and late stages of AMD, respectively. It does **not** provide a clear authoritative definition for the local intermediate / `MNV_suspected` category, nor does it explain why the project’s supplied records include a patient ID with both AMD and DME labels or two validation patients with multiple AMD subcategories.

The current Mendeley Data v4 metadata identifies the dataset license as **CC BY 4.0**. This is a reuse license that requires attribution and indication of changes; it is not an educational-only license. The IEEE DataPort listing separately states that access through IEEE DataPort requires a subscription. Mendeley Data v4 is a distinct, versioned repository route. This review did not download files or test a file download. A dataset license does not itself settle ethics, privacy, institutional, or clinical-use obligations.

The sources therefore clarify broad disease-group meanings and licensing, but do not resolve the project’s conflicting patient-level records or all subtype semantics. Retain the label-source reconciliation as the first step; do not adjust labels or use test results to select modeling choices. The proposed controlled loss-weight experiment remains downstream of that reconciliation.

## 1. Sources verified

### Original dataset paper

**Full citation:** Mikhail Kulyabin, Aleksei Zhdanov, Anastasia Nikiforova, Andrey Stepichev, Anna Kuznetsova, Mikhail Ronkin, Vasilii Borisov, Alexander Bogachev, Sergey Korotkich, Paul A. Constable, and Andreas Maier. “OCTDL: Optical Coherence Tomography Dataset for Image-Based Deep Learning Methods.” *Scientific Data* 11, Article 365 (2024), published 2024-04-11. DOI: [10.1038/s41597-024-03182-7](https://doi.org/10.1038/s41597-024-03182-7).

**Primary article / DOI:** [https://doi.org/10.1038/s41597-024-03182-7](https://doi.org/10.1038/s41597-024-03182-7)  
**Full-text preprint reviewed:** [https://arxiv.org/html/2312.08255v4](https://arxiv.org/html/2312.08255v4)  
**Preprint record:** [https://arxiv.org/abs/2312.08255](https://arxiv.org/abs/2312.08255)

The article metadata was checked through Crossref; title, authors, journal, volume 11, issue 1, article number 365, publication date, DOI, and article license metadata were consistent. Nature’s article page itself returned a client challenge in the available HTTP fetch, so the paper’s full text was consulted through the authors’ arXiv v4 manuscript rather than claiming direct full-text access from Nature.

### Dataset repository and listing

- **Mendeley Data, version 4:** [https://data.mendeley.com/datasets/sncdhf53xc/4](https://data.mendeley.com/datasets/sncdhf53xc/4), DOI [10.17632/sncdhf53xc.4](https://doi.org/10.17632/sncdhf53xc.4), version published 2024-03-18. The repository page’s structured dataset metadata lists the name, version, date, disease-group description, and license.
- **IEEE DataPort listing:** [https://ieee-dataport.org/documents/octdl-optical-coherence-tomography-dataset-image-based-deep-learning-methods](https://ieee-dataport.org/documents/octdl-optical-coherence-tomography-dataset-image-based-deep-learning-methods).
- **License text:** [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

The paper’s data-records section points to Mendeley Data. Its bibliography identifies the OCTDL data DOI family `10.17632/sncdhf53xc`; the current Mendeley page resolves the reviewed release to version 4.

## 2. What the paper says about disease groups and labels

The paper’s abstract and dataset description identify the OCTDL image groups as AMD, DME, ERM, RAO, RVO, VID, and normal. The article describes pathologies and OCT appearances in its disease-group sections. The summaries below are paraphrases of the authors’ paper, not independent clinical definitions or validation.

| Dataset field / group | What the authors document | Relevance and limits |
|---|---|---|
| **AMD** | The authors describe AMD as an acquired retinal degeneration involving drusiform/RPE and neovascular abnormalities. They describe drusen and OCT appearance. In the technical-validation discussion, they state: “Drusen and MNV are the early and late stages of AMD, respectively.” | The paper supports a broad early/late association for drusen/MNV. It does not provide a clear definition of an intermediate `MNV_suspected` label in the accessible text. |
| **DME** | The authors discuss diabetic macular edema in relation to diabetic retinopathy and describe OCT features including hard exudates, intraretinal fluid, and DRIL. | This is a disease-group description; the paper does not define why a particular patient ID in the local dataset also has an AMD row. |
| **ERM** | The authors describe epiretinal membrane as glial/connective tissue proliferation on the inner retinal surface, with possible retinal thickening, wrinkling, and traction. | The project treats ERM as one source class and maps it to binary Non-AMD. |
| **NO / Normal** | The dataset table and listing use `NO` / “Normal” as a control category; the methods include normal OCT examples. | The paper/listing support the category name. A detailed definition of all inclusion criteria for “Normal” was not verified here. |
| **RAO** | The authors describe central and branch retinal artery occlusion as causing acute ischemia, inner-retinal hyperreflectivity, and edema on OCT. | This is the paper’s disease-group characterization, not a project-specific label rule. |
| **RVO** | The authors describe vein-occlusion-associated macular edema, often cystic and localized to inner retina, and discuss ischemic changes. | This is one of the source negative categories in the project’s binary AMD task. |
| **VID** | The authors describe vitreomacular interface disease as a group related to abnormal posterior vitreous detachment/adhesion and traction, which may lead to retinal deformation, tears, cysts, or holes. | The paper identifies this group broadly; the project does not separately model its subtypes. |

The article also names pathological conditions including MNV, DRIL, drusen, macular edema, and macular hole. The IEEE and Mendeley descriptions say the CSV includes `disease`, `subcategory`, and `condition` fields, but neither short listing provides a complete data dictionary for every value.

### AMD stages and local condition values

The paper’s explicit stage statement is that drusen and MNV correspond to early and late AMD, respectively. That statement does not establish that all drusen observations are a complete or mutually exclusive definition of early AMD, nor that every MNV record is late AMD under every clinical scheme.

The project’s local records include:

- `early` / `drusen`
- `intermediate` / `MNV_suspected`
- `late` / `MNV`

The first and third pairs broadly align with the paper’s early/late statement. The paper and repository documentation reviewed here do not define the `intermediate` / `MNV_suspected` pair, explain how “suspected” was assigned, or show whether this is an official released subtype, a later metadata addition, or a local transformation. Treat that specific mapping as **unverified** until the exact data release’s data dictionary or custodians confirm it.

## 3. Image, eye, patient, and examination unit

The paper states that:

- OCTDL consists of **2,064 images of 821 patients** in its final release.
- Images are JPG B-scans in disease-labeled folders.
- Filenames consist of disease label, patient ID, and a sequence number.
- The CSV has fields including `file_name`, `disease`, `subcategory`, `condition`, `patient_id`, `eye`, `sex`, `year`, and image dimensions.
- Eye, age/sex information is included for images where that information was available for publication.
- The dataset was split by patient in the authors’ experiments so images from one patient were confined to one subset.
- The paper describes initial independent image labeling by seven trained medical students, consensus discussion for disagreements, screening of patients with ambiguous diagnoses for further peer review, independent labeling by two experienced clinical specialists with disagreements resolved by consensus, and confirmation of final diagnoses for all patients by the clinic expert.
- The paper states that each B-scan was centered on the fovea and interpreted/cataloged by a retinal specialist.

**Interpretation:** The CSV associates labels with individual image records, and the filename scheme links image rows to a supplied patient ID. However, the annotation description also speaks of final diagnosis for patients. The paper does not fully specify whether every label is an independent image-level finding, a patient/exam diagnosis copied to images, or how diagnoses are assigned when different images from one patient show different conditions. It does not document an examination/visit identifier or establish that the filename sequence number represents chronological order. No chronology or eye relationship is inferred from filename order here.

## 4. Do the sources resolve the observed multi-label patient records?

**No.**

The authors’ methods say ambiguous diagnoses were screened out and patient-level separation was used in their experiments. Those statements do not explain the exact rows in the local project. The source paper and repository metadata reviewed do not provide a per-patient exception table or explicit rule that permits, prohibits, or explains mixed disease labels or multiple AMD subcategories under one patient ID.

| Local observation from the saved split files | Source-documentation result |
|---|---|
| One test patient ID has both AMD and DME source labels. | **Unresolved.** The paper does not explain this ID or establish whether it represents separate eyes/examinations, a labeling convention, a data issue, or another circumstance. Do not automatically treat either row as mislabeled. |
| Two validation patients have multiple AMD subcategories (early + intermediate; intermediate + late). | **Unresolved.** The broad paper statement that drusen and MNV correspond to early and late AMD does not explain intermediate / `MNV_suspected` or these specific patients. |
| Paper states 821 patients; current local manifest has 820 distinct supplied patient IDs across the saved partitions. | **Unresolved count discrepancy.** The local partition rows total 2,062 usable images out of 2,064 source rows. That does not establish why the paper’s patient count differs by one from the local unique-ID count. No ID was added, removed, or inferred. |

These records should be reconciled with the exact release/version and dataset documentation before using them to define patient-level binary or subtype targets. Preserve the current source labels until authoritative clarification is available.

## 5. Repository version, counts, and access notes

The Mendeley Data v4 metadata (dated 2024-03-18) and IEEE DataPort listing report the following disease-group image counts:

| Group | Mendeley v4 / IEEE listing |
|---|---:|
| AMD | 1,231 |
| DME | 147 |
| ERM | 155 |
| Normal | 332 |
| RAO | 22 |
| RVO | 101 |
| VID | 76 |
| **Total** | **2,064** |

The local raw labels also contain 2,064 rows and the same overall disease-category image totals. However, the local file has only 820 distinct `patient_id` values; the paper states 821 patients. The source listings do not reconcile this one-patient difference.

The current Mendeley v4 page exposes a “Download All Files” control in its public page metadata. This review did not click it, retrieve any dataset file, or validate the file payload. The IEEE DataPort listing states that accessing the dataset through that platform “requires an IEEE DataPort Subscription.” These are different repository access statements; use the versioned Mendeley record and its terms rather than assuming IEEE subscriber access or that all routes have identical conditions.

## 6. License and student research implications

The Mendeley Data v4 record identifies the dataset license as **CC BY 4.0** and links to the [CC BY 4.0 deed](https://creativecommons.org/licenses/by/4.0/). The license allows sharing and adaptation, including commercial reuse, subject to its conditions. Relevant conditions include giving appropriate credit, linking the license, indicating changes, and not implying endorsement. The Mendeley page also has platform Terms of Use; the data license does not displace those platform terms.

The dataset page does not state an educational-only or noncommercial-only restriction in its license field. Accordingly, the dataset’s stated CC BY 4.0 license does not appear to prohibit a student academic prototype as such, provided license conditions are followed. This is a summary of the displayed license metadata, not legal advice or institutional approval.

The paper reports ethics committee approval for the authors’ study and informed written consent from its participants. That statement applies to the source study. It is **not** approval for this project, does not settle local institutional requirements, and does not guarantee that every downstream use is appropriate. Before redistribution or public demonstration, verify attribution, provenance/version, platform terms, applicable privacy/data-protection rules, and any faculty/institutional review. Do not upload images to third-party services.

The paper itself is an open-access article; the Mendeley record specifically marks the **dataset** CC BY 4.0. Do not infer dataset rights solely from the article’s open-access status.

## 7. Effect on the proposed experiment plan

The source documentation confirms that the dataset authors associate drusen with early AMD and MNV with late AMD, and that image records are linked through supplied patient IDs. It does not define the intermediate / `MNV_suspected` category or reconcile the mixed AMD/DME patient and multiple-subcategory validation patients. It also reveals a 821-versus-820 patient-count discrepancy between paper and local manifest.

Therefore, the recommended first action in [AMD_LABEL_AND_PATIENT_BALANCE_AUDIT.md](./AMD_LABEL_AND_PATIENT_BALANCE_AUDIT.md) remains a **source-version and label reconciliation**, not a model change. Clarify the version represented by the local files and the unresolved patient/subcategory mappings before any new training. The proposed controlled `pos_weight` comparison remains a later experiment, using training-only counts and patient-grouped validation, with a fresh untouched patient-level test cohort for confirmatory evaluation. Do not use existing held-out test outcomes to choose label rules, weights, or thresholds.

## 8. Evidence, access, and limitations

### Verified from accessible sources

- Crossref bibliographic metadata for the DOI: title, authors, *Scientific Data* volume/issue, article number, publication date, DOI, and article license metadata.
- The arXiv v4 full text: dataset acquisition modality, image-level CSV fields, class descriptions, annotation workflow, patient-level split statement, AMD drusen/MNV stage statement, 2,064 images/821 patients, and the Mendeley data citation.
- Mendeley Data v4 page metadata: record name, version 4, date 2024-03-18, group counts, and CC BY 4.0 license.
- IEEE DataPort listing content, including its subscription access notice and the CSV field list.
- The local dataset and source-code facts reported in `AMD_LABEL_AND_PATIENT_BALANCE_AUDIT.md`.

### Not verified / not done

- A direct full-text retrieval from the Nature article page; the available request returned a client challenge, so arXiv v4 was used for article text.
- The exact reason for the local-versus-paper patient-count discrepancy.
- The official intended meaning of local `intermediate` / `MNV_suspected`.
- The explanation or correctness of the mixed AMD/DME patient ID and multiple-subcategory validation patients.
- Whether filename sequence numbers denote anything beyond naming order; no chronology was inferred.
- A download of the Mendeley dataset files, verification that local files are byte-identical to a particular release, or testing of access to file downloads.
- Legal or institutional approval for this individual project.

Only `OCTDL_OFFICIAL_DOCUMENTATION_REVIEW.md` was created. No dataset files were downloaded or changed.

## Sources

1. Kulyabin M. et al. (2024). “OCTDL: Optical Coherence Tomography Dataset for Image-Based Deep Learning Methods.” *Scientific Data*, 11, Article 365. [https://doi.org/10.1038/s41597-024-03182-7](https://doi.org/10.1038/s41597-024-03182-7).
2. Kulyabin M. et al. (2024). Author manuscript, arXiv:2312.08255v4. [HTML full text](https://arxiv.org/html/2312.08255v4); [arXiv record](https://arxiv.org/abs/2312.08255).
3. Kulyabin M. et al. (2024). “OCTDL: Optical Coherence Tomography Dataset for Image-Based Deep Learning Methods,” Mendeley Data, v4. [https://doi.org/10.17632/sncdhf53xc.4](https://doi.org/10.17632/sncdhf53xc.4); [versioned repository page](https://data.mendeley.com/datasets/sncdhf53xc/4).
4. OCTDL dataset listing, IEEE DataPort. [https://ieee-dataport.org/documents/octdl-optical-coherence-tomography-dataset-image-based-deep-learning-methods](https://ieee-dataport.org/documents/octdl-optical-coherence-tomography-dataset-image-based-deep-learning-methods).
5. Creative Commons. Attribution 4.0 International legal code/deed. [https://creativecommons.org/licenses/by/4.0/](https://creativecommons.org/licenses/by/4.0/).
