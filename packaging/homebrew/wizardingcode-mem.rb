# Homebrew formula for wizardingcode-mem. Lives in the tap WizardingCode-io/homebrew-wizardingcode as
# Formula/wizardingcode-mem.rb; this copy is the source it is updated from on each release.
#
#   brew install wizardingcode-io/wizardingcode/wizardingcode-mem
class WizardingcodeMem < Formula
  desc "Persistent memory for coding agents: one local binary, no daemon"
  homepage "https://github.com/WizardingCode-io/wizardingcode-mem"
  version "0.4.4"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.4/wizardingcode-mem-darwin-arm64"
      sha256 "203bf0a1720eb16925315de3fc78be6aa1dde21ff71410da6ad3c8571dc792df"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.4/wizardingcode-mem-darwin-x64"
      sha256 "eba72fd3a6c3283ce5dded1ac9f61dd1ca66cf1a9d825a020de7f0ced04c70df"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.4/wizardingcode-mem-linux-arm64"
      sha256 "d8518fed2276658420a6961d5fcc342b8049c68c4b06fb37060180c6df689ebf"
    end
    on_intel do
      url "https://github.com/WizardingCode-io/wizardingcode-mem/releases/download/v0.4.4/wizardingcode-mem-linux-x64"
      sha256 "cd3c63773f4eeb8ebafd9767d0ae89330873b12256d330f7b9cdedde5580a5f2"
    end
  end

  def install
    bin.install Dir["wizardingcode-mem-*"].first => "wizardingcode-mem"
  end

  def caveats
    <<~EOS
      Set it up for the agents on this machine:
        wizardingcode-mem install
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/wizardingcode-mem --version")
  end
end
