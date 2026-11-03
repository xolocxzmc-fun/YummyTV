plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val ciVersionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()

android {
    namespace = "tv.yummy.client"
    compileSdk = 35

    defaultConfig {
        applicationId = "tv.yummy.client"
        minSdk = 21
        targetSdk = 35
        versionCode = ciVersionCode
        versionName = "1.0.$ciVersionCode"
    }

    signingConfigs {
        create("release") {
            storeFile = rootProject.file("keystore/yummytv.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD") ?: "yummytv"
            keyAlias = "yummytv"
            keyPassword = System.getenv("KEY_PASSWORD") ?: "yummytv"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }

    androidResources {
        // The web UI is already compact; don't compress it so WebView reads it faster.
        noCompress += listOf("html", "js", "css")
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
