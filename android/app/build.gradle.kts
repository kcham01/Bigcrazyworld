plugins {
    id("com.android.application")
}

android {
    namespace = "app.tbcrushcalc"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.tbcrushcalc"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("VERSION_NAME") ?: "0.1"
    }

    signingConfigs {
        create("release") {
            // The key never lives in the repo: ci/build.sh writes it from the repository secrets
            // (BCW_KEYSTORE, BCW_KEYSTORE_PASSWORD), or makes a throw-away one when they aren't set.
            storeFile = file(System.getenv("BCW_KEYSTORE_FILE") ?: "missing.jks")
            storePassword = System.getenv("BCW_KEYSTORE_PASSWORD") ?: ""
            keyAlias = "bigcrazyworld"
            keyPassword = System.getenv("BCW_KEYSTORE_PASSWORD") ?: ""
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
