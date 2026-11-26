import './SunnyOverlay.css';

/**
 * Cloud shadows that drift across the viewport while sunny mode is on
 * (Admin → Appearance). Two layers move the same way at different speeds for
 * depth; CSS keyframes do the moving, and `[data-theme="sunny"]` shows them.
 */
export function SunnyOverlay() {
  return (
    <div className="sunny-shadow-overlay" aria-hidden="true">
      {/* Layer 1: large clouds, slow drift */}
      <div className="sunny-cloud-track sunny-cloud-track-1">
        <svg className="sunny-cloud-svg" viewBox="0 0 3200 900" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="cloud-blur-1">
              <feGaussianBlur stdDeviation="12" />
            </filter>
          </defs>
          <g filter="url(#cloud-blur-1)">
            {/* Large cumulus */}
            <path opacity="0.09" d="M200 250 Q240 160 340 180 Q400 120 500 160 Q560 100 650 150 Q720 90 800 140 Q860 110 900 170 Q950 140 980 200 Q1000 180 1020 230 Q1000 300 900 330 Q780 360 620 350 Q460 360 320 340 Q220 330 200 280Z" fill="black" />
            {/* Wide flat cloud */}
            <path opacity="0.06" d="M1100 350 Q1150 290 1280 310 Q1360 260 1480 300 Q1560 270 1660 310 Q1730 290 1780 340 Q1820 320 1840 360 Q1820 410 1700 430 Q1540 450 1380 440 Q1220 450 1140 420 Q1100 400 1100 370Z" fill="black" />
            {/* Small puff */}
            <path opacity="0.07" d="M2000 180 Q2040 130 2120 150 Q2170 110 2240 145 Q2280 125 2310 165 Q2330 150 2350 190 Q2330 230 2260 245 Q2170 260 2080 248 Q2020 240 2000 210Z" fill="black" />
            {/* The first cloud again, offset, so the loop is seamless */}
            <path opacity="0.09" d="M2800 250 Q2840 160 2940 180 Q3000 120 3100 160 Q3160 100 3250 150 Q3320 90 3400 140 Q3460 110 3500 170 Q3550 140 3580 200 Q3600 180 3620 230 Q3600 300 3500 330 Q3380 360 3220 350 Q3060 360 2920 340 Q2820 330 2800 280Z" fill="black" />
          </g>
        </svg>
      </div>

      {/* Layer 2: smaller clouds, a little faster */}
      <div className="sunny-cloud-track sunny-cloud-track-2">
        <svg className="sunny-cloud-svg" viewBox="0 0 3200 900" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="cloud-blur-2">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>
          <g filter="url(#cloud-blur-2)">
            {/* Mid cloud */}
            <path opacity="0.07" d="M100 500 Q140 440 230 460 Q290 410 380 445 Q430 420 470 460 Q510 440 540 480 Q530 530 460 545 Q370 560 270 550 Q170 555 120 530 Q100 515 100 500Z" fill="black" />
            {/* Stretched wisp */}
            <path opacity="0.05" d="M700 650 Q750 610 860 630 Q940 595 1060 625 Q1130 605 1180 640 Q1210 630 1230 660 Q1210 700 1120 710 Q990 725 850 715 Q740 720 710 690 Q695 670 700 650Z" fill="black" />
            {/* Round puff */}
            <path opacity="0.08" d="M1500 420 Q1540 360 1630 385 Q1680 345 1750 375 Q1800 355 1840 395 Q1865 380 1880 415 Q1870 460 1800 478 Q1710 495 1610 485 Q1530 488 1510 458 Q1495 440 1500 420Z" fill="black" />
            {/* Offset copies for the loop */}
            <path opacity="0.07" d="M2700 500 Q2740 440 2830 460 Q2890 410 2980 445 Q3030 420 3070 460 Q3110 440 3140 480 Q3130 530 3060 545 Q2970 560 2870 550 Q2770 555 2720 530 Q2700 515 2700 500Z" fill="black" />
            <path opacity="0.08" d="M2100 420 Q2140 360 2230 385 Q2280 345 2350 375 Q2400 355 2440 395 Q2465 380 2480 415 Q2470 460 2400 478 Q2310 495 2210 485 Q2130 488 2110 458 Q2095 440 2100 420Z" fill="black" />
          </g>
        </svg>
      </div>
    </div>
  );
}
