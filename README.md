# QR Snapper

QR Snapper is a simple, small, progressive web app that accesses the user's camera and looks for QR Codes.

The QR Code library is a port of [JSQRCode](https://github.com/LazarSoft/jsqrcode) and has been ported to work inside a Web Worker for performance.

## Features

QR Snapper offers a seamless QR code scanning experience directly in your browser. Key features include:

* **Real-time QR Code Scanning:** Instantly decode QR codes using your device's camera.
* **Cross-Platform Compatibility:** Tested and optimized for major browsers (Chrome, Firefox, Safari) and mobile devices.
* **x-callback-url support:** Allows other applications to receive the decoded QR code data.

## Build Instructions

To set up QR Snapper locally, follow these steps:

1.  **Prerequisites:**
    * Node.js (v16 or later)
    * npm (v8 or later)
2.  **Installation:**
    * Clone the repository: `git clone https://github.com/PaulKinlan/qrcode.git`
    * Navigate to the project directory: `cd qrcode`
    * Install dependencies: `npm install`
    * Run the local server: `gulp serve`
    * Build for production: `gulp`
    * \*Note: If you encounter errors with gulp, run `rollup gulpfile.babel.js -f cjs -o gulpfile.js`\*
3.  **Potential Issues:**
    * Ensure your Node.js and npm versions meet the prerequisites.
    * Camera access may require browser permissions.

## Getting Started (Quick Start)

To quickly test QR Snapper, follow these steps:

1.  **Clone or Fork the Repository:**

    * \*Note: This step requires an internet connection.\*
    * Clone the repository directly, or fork it and then clone your fork:
        ```bash
        git clone [https://github.com/PaulKinlan/qrcode.git](https://github.com/PaulKinlan/qrcode.git)
        ```
        or
        ```bash
        git clone [https://github.com/YOUR_USERNAME/qrcode.git](https://github.com/YOUR_USERNAME/qrcode.git)
        ```

2.  **Navigate to the Project Directory:**

    * Open a terminal and navigate to the `qrcode/` directory:
        ```bash
        cd qrcode
        ```

3.  **Install Dependencies:**

    * \*Note: This step requires an internet connection.\*
    * Run `npm install` to install the necessary dependencies (defined in `package.json`).

4.  **Open in Browser:**

    * Open `index.html` (or your main HTML file) in your web browser.

**Note:** For full functionality (including camera access and advanced build processes), you may need to grant camera permissions and ensure your browser supports the necessary APIs. Refer to the full build instructions for details about build processes.

## Code Architecture

To better understand the codebase, here's a breakdown of the key components:

* **`main.mjs`:**
    * This is the main entry point of the application.
    * It orchestrates camera access, QR code detection, and user interface interactions.
    * It uses several manager classes to handle different functionalities.
    * It is designed to be a module.
* **`qrclient.js`:**
    * This file contains the QR code decoding logic, ported from the JSQRCode library.
    * It is optimized to run within a Web Worker for performance.
    * This file is responsible for taking the video feed, and processing it to find a QR code.
* **`qrworker.js`:**
    * This file implements the QR code decoding logic, ported from the JSQRCode library.
    * It is optimized to run within a Web Worker for performance.
    * This file is responsible for taking the video feed, and processing it to find a QR code.

### Development Notes

* The project uses `gulp` as a build tool.
* The project uses both a module and non-module javascript file to increase browser compatibility.
* The project uses a polyfill to support older browsers.

## Contributing

We welcome contributions to QR Snapper! Please follow these guidelines:

1.  **Reporting Issues:**
    * Use the GitHub issue tracker to report bugs or suggest feature requests.
2.  **Development Setup:**
    * Fork the repository and create a branch for your changes.
3.  **Coding Standards:**
    * Follow the existing code style and conventions.
4.  **Pull Requests:**
    * Submit pull requests with clear descriptions of your changes.
    * Ensure your code is tested and documented.

## License

This project is licensed under the Apache License 2.0.
