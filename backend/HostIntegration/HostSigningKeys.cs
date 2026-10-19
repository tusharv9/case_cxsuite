namespace CaseManagement.Api.HostIntegration;

using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

/// <summary>
/// Keys for validating Host tokens that were configured directly (no discovery document). With an Authority or
/// MetadataAddress the keys come from the Host's discovery document instead, and these return null.
/// </summary>
public static class HostSigningKeys
{
    public static IEnumerable<SecurityKey>? Create(HostIntegrationOptions.JwtSettings jwt)
    {
        var keys = new List<SecurityKey>();

        if (!string.IsNullOrWhiteSpace(jwt.PublicKeyPem))
        {
            var rsa = RSA.Create();   // kept alive for the life of the process: the key object references it
            try { rsa.ImportFromPem(Normalize(jwt.PublicKeyPem)); }
            catch (Exception ex) when (ex is ArgumentException or CryptographicException)
            {
                throw new InvalidOperationException(
                    "HostIntegration:Jwt:PublicKeyPem is not a valid PEM RSA public key (expected \"-----BEGIN PUBLIC KEY-----…\").", ex);
            }
            if (rsa.ExportParameters(false).D != null)
                throw new InvalidOperationException("HostIntegration:Jwt:PublicKeyPem must be the PUBLIC key only.");
            keys.Add(new RsaSecurityKey(rsa));
        }

        if (!string.IsNullOrWhiteSpace(jwt.SymmetricKey))
            keys.Add(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SymmetricKey)));

        return keys.Count > 0 ? keys : null;
    }

    /// <summary>Pins the algorithm to the configured key types, so an RSA key can never be used as an HMAC secret.</summary>
    public static IEnumerable<string>? Algorithms(HostIntegrationOptions.JwtSettings jwt)
    {
        var algorithms = new List<string>();
        if (!string.IsNullOrWhiteSpace(jwt.PublicKeyPem)) algorithms.Add(SecurityAlgorithms.RsaSha256);
        if (!string.IsNullOrWhiteSpace(jwt.SymmetricKey)) algorithms.Add(SecurityAlgorithms.HmacSha256);
        return algorithms.Count > 0 ? algorithms : null;
    }

    // Environment variables often carry a PEM on one line with literal "\n" sequences.
    private static string Normalize(string pem) => pem.Replace("\\n", "\n").Trim();
}
