import cv2
from main import detect_card

# img = cv2.imread("./training-data/JU-1.jpg")
img = cv2.imread("crop.jpg")
crop = detect_card(img)
if crop is not None:
    cv2.imwrite("crop.jpg", crop)
    print(f"crop: {crop.shape}")
else:
    print("no card")
