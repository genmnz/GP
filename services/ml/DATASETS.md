# Congestion datasets — research notes & decisions

Why v1 of the congestion model plateaued, what other data exists, and what v2 does about
it. Companion to [`notebooks/train_congestion_v2_colab.ipynb`](notebooks/train_congestion_v2_colab.ipynb).

## The diagnosis (not "too few images")
v1 trained on **one** source — the Norway traffic-camera set — so the net learned a single
fixed camera angle rather than "traffic", and generalised poorly to other viewpoints. On
top of that, the 4-class boundaries (`empty/low/high/jam`) are subjective, so the labels
themselves are noisy. 6k high-quality images is plenty; **domain diversity** and **label
noise** are the real ceilings, plus v1's blunt training recipe (fine-tuned the whole
pretrained net at `lr=1e-3` from epoch 1, saved the last epoch instead of the best).

## Datasets evaluated

| dataset | size | classes | loads in Colab | verdict |
|---|---|---|---|---|
| **Norway traffic-camera** (`ilsilfverskiold/traffic-camera-norway-images`, HF) | 6,779 (train 6,100 / val 679) | no/low/medium/high-traffic (4 ordinal) | `load_dataset(...)` | **Keep — backbone.** Only source covering all 4 levels. Imbalanced (low-traffic dominates). |
| **Traffic-Net** (OlafenwaMoses, GitHub release) | 4,400 (1,100×4) | sparse_traffic, dense_traffic, accident, fire | direct `wget` of `trafficnet_dataset_v1.zip` (50 MB, no auth) | **Add.** Web-sourced (Google/Bing/Flickr) → many angles/positions = the diversity v1 lacked. Use `sparse→low`, `dense→jam`; drop accident/fire (out of scope). |
| Roboflow "traffic congestion" sets | 150–600 each | car/truck/bus boxes | API/export | **Detection, not congestion levels.** Useful only for the YOLO/count route, and YOLO already comes COCO-pretrained. |
| HF `abhash-rai/traffic-congestion-classifier` | — | congested / uncongested / unrelated (3) | model, not a dataset | Only 2 usable levels; coarser than ours. Skipped. |
| Kaggle Traffic-Net / classification sets | — | same as Traffic-Net | needs Kaggle token | Same data as the GitHub release; we use the token-free release instead. |

Net result: **2 datasets loaded and trained by default** (Norway + Traffic-Net), each
declaring its own label→class mapping. A **3rd pluggable ImageFolder slot**
(`USE_IMAGEFOLDER`) lets you mix in new camera positions — your own captured frames or any
download — by dropping them into `data/extra/{empty,low,high,jam}/`. No clean *auth-free*
4-level congestion dataset exists beyond Norway (the HF candidates are 4-image stubs or
captioning sets), so this drop-in is the honest way to add real viewpoint variety rather
than wiring a fragile/mismatched source.

## Two approaches, benchmarked head-to-head in the notebook

**Track A — better classifier.** Norway + Traffic-Net, two-phase transfer learning
(freeze head → fine-tune), label smoothing, class-balanced sampling, stronger augmentation,
cosine LR, save-best-on-val. Outputs the same `traffic.pt` the service already loads.

**Track B — the pivot: detect cars.** A COCO-pretrained **YOLO** counts vehicles per image
(no training, viewpoint-robust), and three count thresholds — calibrated on the Norway
labels — map count → `empty/low/high/jam`. Literally "detects cars", fixes the
different-positions weakness, and is easy to justify in a defense.

Both are evaluated on the **same Norway validation split** (and v1's number is reproducible
there too), so the report gets a fair v1 vs A vs B comparison. Lead the report with **mean
weighted error**, not raw accuracy: an `empty`→`jam` mistake is what actually breaks a
signal; adjacent-class slips barely change the green split.

## Sources
- Norway dataset — https://huggingface.co/datasets/ilsilfverskiold/traffic-camera-norway-images
- Traffic-Net — https://github.com/OlafenwaMoses/Traffic-Net (release `1.0`, `trafficnet_dataset_v1.zip`)
- Ultralytics YOLO — https://docs.ultralytics.com
